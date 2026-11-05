# Sonari database concept: schema, indexes and Postgres setup

Status: proposal · Scope: Sonari Postgres schema, connection setup, expensive queries · Date: 2026-11-03

## Why

Sonari instances hold up to 1.5 TB of audio and millions of sound events. The audio
lives on disk. The database is a few GB to tens of GB, which is not large for Postgres.
The slowdowns come from five things:

1. Postgres runs with default settings (128 MB shared buffers, 1 GB WAL).
2. Connection pools can request more connections than Postgres allows.
3. Filters parse JSON strings and walk feature rows at query time.
4. Every write has to maintain redundant indexes.
5. Several endpoints aggregate whole projects on every request.

This document proposes a target schema, index set and Postgres setup, and lists the
expensive operations with a fix for each. Most changes are independent and can ship
one at a time (see [Rollout](#6-rollout)).

**Measured vs. inferred.** The only database available for this was the 37 MB dev
instance. Index definitions, column types and data shapes were read from it. Costs are
inferred from query structure, not timed at production size. Before and after each
step, check the effect with `pg_stat_statements` on a production instance.

**Who owns which data.** Sound events, their geometry JSON and their confidence values
come from ecohub's processing. They're written into the Sonari database by
`ecohub/processors/audio/sonari_writer.py`. Changing their format is a contract change
between two projects, so those changes are in a separate, lower-priority section
([§2](#2-data-from-ecohub-lower-priority)). Sections 1, 3, 4 and 5 can be done in Sonari
alone.

Already done:
- On `main`: connection pools are sized per process from the environment (§4.1).
- On `dbperformance` (PR 1 and PR 2):
  - Task stats are now one SQL aggregate instead of a Python loop.
  - The unpaginated task index no longer computes `count(*) OVER ()`.
  - The date + time filter works on Postgres (it called SQLite's `datetime()`).
  - The frontend refetches the task index and stats only when an edit can change them.
- On `dbperformance`: correction stats compare detector predictions from the GUANO
  files with reviewed tasks, without any schema change (§2.3).

---

## 1. Schema changes in Sonari

### 1.1 Recording time as one column

**Today:** `recording.date` and `recording.time` are separate. Date + time filters have to
combine them per row, and sorting by recording time sorts on two columns through a join.

**Proposal:**

```sql
ALTER TABLE recording ADD COLUMN recorded_at timestamp GENERATED ALWAYS AS (date + time) STORED;
CREATE INDEX ix_recording_recorded_at ON recording (recorded_at, id);
```

Tested on Postgres 13. The date range filter and `sort_by=recording_datetime` then use one
indexed column. This replaces `ix_recording_date_time`. Postgres computes the column, so
ecohub's `_patch_recording_metadata`, which sets date and time, needs no change.

The night/day filter (PR 3) adds `is_night` / `is_day` here as well. Those can't be
generated columns because they need `astral`, so the application sets them.

### 1.2 Task status as columns, maintained by a trigger

**Today:** "pending", "verified", "done" etc. are derived per request from
`annotation_status_badge` with `EXISTS` subqueries. That happens in the filters, the
stats, the project species counts and the exports.

**Proposal:** add four flags to `annotation_task`, maintained by a trigger on
`annotation_status_badge`:

```sql
ALTER TABLE annotation_task
  ADD COLUMN is_verified  boolean NOT NULL DEFAULT false,
  ADD COLUMN is_rejected  boolean NOT NULL DEFAULT false,
  ADD COLUMN is_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN is_assigned  boolean NOT NULL DEFAULT false;
-- AFTER INSERT/DELETE/UPDATE trigger on annotation_status_badge recomputes
-- the four flags of the affected task with four EXISTS checks.
CREATE INDEX ix_annotation_task_project_open ON annotation_task (annotation_project_id, id)
  WHERE NOT (is_verified OR is_rejected OR is_completed);
```

- The badge table stays as the per-user history.
- Status filters become column predicates, and stats become a single `GROUP BY`.
- The partial index serves the most common view, "open tasks of a project".
- A trigger rather than application code, because badges are written by the API, the
  bulk actions and potentially other writers. A trigger keeps the flags correct for all
  of them.
- Badge writes are rare (one per user click), so the trigger costs almost nothing.
- ecohub doesn't write badges, so this doesn't touch the import path.

Not proposed: event counters on `annotation_task` (for the `empty` and count filters).
Sound events are written in bulk during ecohub imports, and a row-level trigger there would
slow down the import path. The `EXISTS` checks on
`sound_event_annotation(annotation_task_id)` are index-backed and fine.

### 1.3 Task duration as a column

`annotation_task_feature` holds only one feature, `duration` (1,180 rows on dev), and it's
always `end_time - start_time`. Sonari writes these rows itself
([`_create_task_features`](../back/src/sonari/api/annotation_tasks.py#L948)), not ecohub.

**Done in PR 3:** a generated column `annotation_task.duration` (`end_time - start_time`)
serves `sort_by=duration`. Sonari no longer writes or reads the feature rows. The API still
returns the duration as the task's only feature. The migration deletes the existing rows.

**Drop the table later:** ecohub's pinned Sonari version (`2026.7.1`) still writes a
`duration` row for every new task (`create_many_without_duplicates`). Dropping
`annotation_task_feature` now would make every ecohub import fail, so the table goes in the
release after ecohub raises its pin. The rows written until then are ignored.

### 1.4 Smaller cleanups

- **Timestamp types (decided: no change):** `created_on` is `timestamp without time zone`
  in the database, but the model declares `DateTime(timezone=True)`. The values are in the
  server's local time, not UTC: Postgres converts the UTC timestamps Sonari sends with the
  session time zone (Europe/Berlin on dev). Converting to `timestamptz` would rewrite every
  table with `created_on`, so it stays as it is.
- **ID types:** the IDs are `int4`, which allows about 2.1 billion values. That's enough
  for millions of events, so no change is needed now. If one instance ever approaches
  hundreds of millions of tag links, move `sound_event_annotation_tag.id` and its
  references to `bigint` early, because the migration gets harder as the table grows.
- **`sound_event_annotation.recording_id`** duplicates `annotation_task.recording_id`.
  Keep it, because it lets queries per recording skip the task join, but it shouldn't be
  copied into further tables.

---

## 2. Data from ecohub (lower priority)

These changes touch data that ecohub's processing produces. Do them after §1, §3 and §4,
and only together with the ecohub team.

**Constraints for any change here:**
- ecohub's writer (`sonari_writer._create_event`) builds the geometry JSON and the
  confidence features from detector output, and imports Sonari's own models and schemas.
  A Sonari change that ecohub's writer has to follow needs a matching ecohub release and an
  updated `sonari` dependency in ecohub.
- ecohub's dedup path (`_clone_annotations_from_project`) copies events, tag links and
  feature rows between projects. Any new column holding detector output must be copied
  there as well.
- Older data was imported by earlier versions (sonarix) and doesn't follow ecohub's
  current conventions. For example, 1,114 confidence features on dev have no species
  suffix. Every change has to handle the old shapes as well.

Each subsection starts with a step that works with ecohub's current output unchanged.

### 2.1 Confidence lookups

**Today:** ecohub stores detector confidence as feature rows named
`detection_confidence:<species>`, or `species_confidence:<species>` for BirdEdge
(`sonari_writer.py:1155`). Older imports used the plain names `detection_confidence` /
`species_confidence`. The confidence filter, the median filter and the tag stats all join
event → feature → tag link → tag → user, then pick a feature with
`name LIKE 'detection_confidence%'` (birdedge: `species_confidence%`)
([filters/annotation_tasks.py:781-837](../back/src/sonari/filters/annotation_tasks.py#L781-L837)).

Two problems:
- **Cost:** five joins plus a `LIKE` per candidate event, in the filters that run on the
  largest tables.
- **Correctness:** the `LIKE` ignores the species. On an event with two species tags,
  filtering "species A with confidence > 0.8" also matches if *species B's* confidence is
  above 0.8. The dev data has 19 such events.

**Step 1: Sonari only, no ecohub change.** Match the feature that belongs to the tag
instead of any confidence feature:

```sql
f.name IN (prefix || ':' || tag.value, prefix)  -- prefix = 'species_confidence' for birdedge, else 'detection_confidence'
```

The suffixed name is ecohub's current format. The plain name covers older single-species
imports. Both are exact lookups on the feature primary key `(sound_event_annotation_id, name)`
instead of a `LIKE`. This fixes the wrong-species match and removes most of the per-row
cost. It's the same change in three places (filter, median filter, tag stats).

**Step 2: with ecohub, optional.** Add `confidence float8 NULL` to
`sound_event_annotation_tag`, the row that already says "this event has this species". The
filters then need one join, with no feature and no user lookup. Requires:
- a backfill by exact name match (on dev this covers 4,406 of 5,728 species links; the rest
  are manual tags without confidence);
- ecohub's writer setting `confidence` on the link rows it already creates;
- ecohub's clone path copying the new column;
- a decision on non-species tags (see open questions).

Only worth doing if step 1 isn't fast enough on production.

### 2.2 Event bounds

> **Superseded by §7.2:** the plan is now real columns with a bridge trigger instead of
> generated columns. The analysis below still describes today's cost.

**Today:** ecohub writes the geometry as JSON into `sound_event_annotation.geometry`
(`varchar`). The frequency filters run `CAST(CAST(geometry AS json)->'coordinates'->1 AS FLOAT)`
on every candidate row ([filters/annotation_tasks.py:1042](../back/src/sonari/filters/annotation_tasks.py#L1042),
[:1082](../back/src/sonari/filters/annotation_tasks.py#L1082)). No index can serve them.

**Step 1: Sonari only, no ecohub change.** Stored generated columns that Postgres
computes from the JSON on every write. ecohub keeps writing the geometry exactly as today.

```sql
ALTER TABLE sound_event_annotation
  ADD COLUMN start_time float8 GENERATED ALWAYS AS
    (((geometry::jsonb)->'coordinates'->>0)::float8) STORED,
  ADD COLUMN end_time float8 GENERATED ALWAYS AS
    (((geometry::jsonb)->'coordinates'->>(CASE WHEN geometry_type = 'BoundingBox' THEN 2 ELSE 1 END))::float8) STORED,
  ADD COLUMN low_freq float8 GENERATED ALWAYS AS
    (CASE WHEN geometry_type = 'BoundingBox' THEN ((geometry::jsonb)->'coordinates'->>1)::float8 END) STORED,
  ADD COLUMN high_freq float8 GENERATED ALWAYS AS
    (CASE WHEN geometry_type = 'BoundingBox' THEN ((geometry::jsonb)->'coordinates'->>3)::float8 END) STORED;
```

I tested this on Postgres 13 with a temporary copy of all 5,786 dev events. Every
`BoundingBox` and `TimeInterval` row converts, and `end_time >= start_time` holds for
all of them. Other geometry types get `NULL`, which matches how the current filters
treat them. The frequency filters then become plain comparisons.

Trade-offs:
- Every event insert parses its JSON once more. That cost lands on ecohub's import, so
  measure it during a test import before rolling it out.
- Adding the columns rewrites the table once (`ACCESS EXCLUSIVE` lock): plan minutes of
  downtime per 10M events.
- Only worth doing if frequency filters are actually used on large projects. Check
  `pg_stat_statements` first.

**Derived feature rows:** older imports also stored `low_freq`, `high_freq`, `duration`
and `bandwidth` as four feature rows per event (3,724 of 9,591 feature rows on dev).
ecohub's current writer no longer creates them. They can be computed from the geometry, so
deleting them shrinks the feature table and its index. Check first that no export, Grafana
dashboard or ecohub process reads them.

### 2.3 Correction stats (done, no schema change)

> **To be replaced by §7.3:** once originals and history are in the database, the stats
> read from there and the GUANO files are only read by the backfill in §7.4.

The correction stats on the project overview and the corrections export compare the
predictions in the GUANO files with what reviewers made of them
([prediction_corrections.py](../back/src/sonari/services/prediction_corrections.py)).
They read ecohub's output as it is and need no database change:

- **Read at runtime:** only the GUANO files of recordings with a completed or verified
  task are read, when someone opens the stats or runs the export. No migration, no
  backfill, nothing stored.
- **Cache:** parsed files stay in memory per worker until their modification time or
  size changes. Each worker reads a file once.
- **Cost on large projects:** one small file read per reviewed recording on the first
  request, then database queries only. If projects with tens of thousands of reviewed
  recordings make the first request too slow, store the parsed predictions in a
  `sound_event_prediction` table, filled the first time a recording is read. That would
  be the first migration this feature needs.
- **Species codes:** a static copy of ecohub's mapping
  ([detector_taxonomy.py](../back/src/sonari/services/detector_taxonomy.py)), to keep in
  sync with ecohub by hand.

---

## 3. Index plan

### 3.1 Drop: duplicates and indexes covered by a longer index

Each of these costs write time on every insert, including ecohub's imports, and takes
space in shared buffers, without serving a query that another index doesn't serve equally
well. Names are from the dev database. Check them on production with `\d+ <table>` first.

| Table | Drop | Covered by |
|---|---|---|
| `annotation_task_tag` | `ix_clip_annotation_tag_tag_id` | exact duplicate of `ix_annotation_task_tag_tag_id` (left over from a rename) |
| `annotation_task_tag` | `ix_clip_annotation_tag_created_by_id` | exact duplicate of `ix_annotation_task_tag_created_by_id` |
| `annotation_task_tag` | `ix_annotation_task_tag_annotation_task_id` | `uq_annotation_task_tag_annotation_task_id (annotation_task_id, tag_id, created_by_id)` |
| `sound_event_annotation_tag` | `ix_sound_event_annotation_tag_sound_event_annotation_id` | `uq_… (sound_event_annotation_id, tag_id, created_by_id)` |
| `sound_event_annotation_tag` | `ix_sound_event_annotation_tag_tag_id` | `ix_sound_event_annotation_tag_tag_id_sea_id (tag_id, sound_event_annotation_id)` |
| `sound_event_annotation_feature` | `ix_…_sound_event_annotation_id` | primary key `(sound_event_annotation_id, name)` |
| `annotation_task_feature` | `ix_…_annotation_task_id` | primary key `(annotation_task_id, name)` |
| `recording_feature` | `ix_…_recording_id` | primary key `(recording_id, name)` |
| `annotation_task` | `ix_annotation_task_annotation_project_id` | `uq_annotation_task_annotation_project_id (annotation_project_id, recording_id, start_time, end_time)` |
| `annotation_status_badge` | `ix_annotation_status_badge_annotation_task_id` | `uq_… (annotation_task_id, user_id, state)` |
| `dataset_recording` | `ix_dataset_recording_dataset_id` | primary key `(dataset_id, recording_id)` |
| `recording` | `ix_recording_date_time` | `ix_recording_recorded_at` (§1.1) |

Also remove `index=True` from the matching model columns, or Alembic autogenerate will
recreate them.

**Check before dropping:** `created_by_id` indexes on the large tables
(`sound_event_annotation`, `sound_event_annotation_tag`). A few detector users own almost
every row, so these indexes have very low selectivity. Their main use is the cascade check
when a user is deleted, which almost never happens. Look at `idx_scan` in
`pg_stat_user_indexes` on production. If it's near zero, drop them, and replace the one on
`sound_event_annotation` with the composite index below.

### 3.2 Add

| Index | Serves |
|---|---|
| `sound_event_annotation (annotation_task_id, created_by_id)` | ecohub re-import: `DELETE … WHERE annotation_task_id = ? AND created_by_id = ?` (speeds up ecohub without changing it). Also replaces the index on `annotation_task_id` alone, which PR 3 drops. |
| `recording (recorded_at, id)` | Date filters and sorting (§1.1) |
| Partial `annotation_task (annotation_project_id, id) WHERE NOT done` | Open-tasks views (§1.2); not done, depends on §1.2 |
| `recording USING gin (path gin_trgm_ops)` (needs `CREATE EXTENSION pg_trgm`; PR 3 skips it with a warning if the extension can't be installed) | `search_recordings`: `path ILIKE '%term%'` ([filters/annotation_tasks.py:319](../back/src/sonari/filters/annotation_tasks.py#L319)) |
| ~~`tag USING gin (value gin_trgm_ops)`~~ not done | Tag search ORs `key`, `value` and species ids ([tag_management.py:192](../back/src/sonari/api/tag_management.py#L192)), so an index on `value` alone can't serve it, and the tag table is small. |
| Later, with §2.2: `sound_event_annotation (annotation_task_id, low_freq, high_freq)` | Frequency filters |
| Later, with §2.1 step 2: `sound_event_annotation_tag (tag_id, confidence)` | Confidence filters |

On production, create every new index with `CREATE INDEX CONCURRENTLY` so tables stay
writable during imports. Alembic needs `op.create_index(..., postgresql_concurrently=True)`
inside an `autocommit_block()`.

---

## 4. Postgres setup

### 4.1 Connection pools

**Done on `main`** ([database.py:184-195](../back/src/sonari/system/database.py#L184-L195)):
pools are sized per process from the environment, `SONARI_DB_POOL_SIZE` (default 5)
and `SONARI_DB_MAX_OVERFLOW` (default 10). Before, every engine used 50 + 50, so up to
700 connections from Sonari alone on 8 cores, against `max_connections=400`. ecohub
calls the same `create_async_db_engine`, so it picks up the new defaults as well.

**Still open:**

| Setting | Now | Proposed | Why |
|---|---|---|---|
| `pool_timeout` | 5 s | 30 s | Under load, a request should wait for a connection rather than fail after 5 s |
| ecohub writer | inherits 5 + 10 | `SONARI_DB_POOL_SIZE=2`, `SONARI_DB_MAX_OVERFLOW=0` in ecohub's environment | The writer works sequentially and needs at most 2; no ecohub code change since the values come from the environment |
| `max_connections` | 400 | 150 | See the rule below and §4.2 |

**Rule:** `workers × (pool_size + max_overflow)` + ecohub processes × their pool +
Grafana + about 10 for admin should stay below `max_connections`. With 7 web workers at
the defaults that's 7 × 15 = 105, plus ecohub, Grafana and admin, so roughly 140.
`max_connections = 150` fits that, or lower `SONARI_DB_MAX_OVERFLOW` to 5 (7 × 10 = 70)
for more headroom. Fewer connections also make the higher `work_mem` in §4.2 safe.

If that's ever not enough, put **PgBouncer** in transaction mode in front of Postgres.
asyncpg caches prepared statements, which breaks in transaction mode unless PgBouncer is
1.21+ with `max_prepared_statements` set, or the engine passes
`connect_args={"statement_cache_size": 0}`.

### 4.2 Server settings

For a host with 16 GB RAM, 8 cores and SSD storage, assuming about 8 GB can go to
Postgres. Scale `shared_buffers` and `effective_cache_size` with the RAM that's really
available. The dev host runs Postgres next to ecohub and is already swapping.

| Setting | Default today | Proposed | Why |
|---|---|---|---|
| `max_connections` | 400 | 150 | See §4.1 |
| `shared_buffers` | 128 MB | 2–4 GB | Keep hot indexes in memory |
| `effective_cache_size` | 4 GB | 6–10 GB | Lets the planner choose index scans |
| `work_mem` | 4 MB | 32 MB | Sorts and hashes for the task index stop spilling to disk (safe with 150 connections) |
| `maintenance_work_mem` | 64 MB | 512 MB–1 GB | Faster index builds and vacuum |
| `max_wal_size` | 1 GB | 8 GB | Imports stop forcing a checkpoint every few minutes |
| `checkpoint_timeout` | 5 min | 15 min | Fewer, smoother checkpoints |
| `checkpoint_completion_target` | 0.5 (PG 13) | 0.9 | Spreads checkpoint I/O out |
| `wal_compression` | off | on | Less WAL during imports |
| `random_page_cost` | 4 | 1.1 | SSD: random reads are cheap |
| `effective_io_concurrency` | 1 | 200 | SSD |
| `jit` | on | off | JIT compilation costs more than it saves for these short OLTP queries |
| `shared_preload_libraries` | – | `pg_stat_statements` | Find the expensive queries |
| `log_min_duration_statement` | -1 | 1000 ms | Log slow queries |
| Container `shm_size` | 128 MB | 1 GB | Parallel queries need shared memory |

Pass these with `-c` flags in the compose `command`, or mount a `postgresql.conf`
under `etc/sonari-db`.

### 4.3 Per-role settings

Settings that should differ by client belong on the database role, not the server:

```sql
-- Web app: no query or idle transaction may hold the app hostage
ALTER ROLE ts_sonari SET statement_timeout = '30s';
ALTER ROLE ts_sonari SET idle_in_transaction_session_timeout = '60s';

-- Separate import role for ecohub: faster commits, data is re-importable
CREATE ROLE ts_sonari_ingest LOGIN PASSWORD '…' IN ROLE ts_sonari;
ALTER ROLE ts_sonari_ingest SET synchronous_commit = off;
ALTER ROLE ts_sonari_ingest SET statement_timeout = '0';
```

With `synchronous_commit = off`, a crash can lose the last few hundred milliseconds of
commits from that role. For imports that's acceptable, because ecohub can import them
again. ecohub only has to switch to the new credentials; its code doesn't change.

Exports may need longer than 30 s. Run them with `SET LOCAL statement_timeout` in their
transaction, or move them to a background job (§5).

### 4.4 Autovacuum on the large tables

With the default `autovacuum_vacuum_scale_factor = 0.2`, a 5M-row table is vacuumed only
after about 1M dead rows. ecohub re-imports delete and re-insert events, so tables bloat
and statistics go stale.

```sql
ALTER TABLE sound_event_annotation         SET (autovacuum_vacuum_scale_factor = 0.01, autovacuum_analyze_scale_factor = 0.005);
ALTER TABLE sound_event_annotation_tag     SET (autovacuum_vacuum_scale_factor = 0.01, autovacuum_analyze_scale_factor = 0.005);
ALTER TABLE sound_event_annotation_feature SET (autovacuum_vacuum_scale_factor = 0.01, autovacuum_analyze_scale_factor = 0.005);
ALTER TABLE annotation_task                SET (autovacuum_vacuum_scale_factor = 0.01, autovacuum_analyze_scale_factor = 0.005);
```

Also run `ANALYZE` on these tables after a large import finishes.

### 4.5 Version

Postgres 13 has been end-of-life since November 2025. Upgrade to 17. Relevant gains here:
lower memory use and faster `VACUUM` (17), faster B-tree lookups for `IN (…)` lists (17),
`pg_stat_io` for I/O analysis (16), and continued security fixes. An upgrade needs
`pg_dump`/`pg_restore` or `pg_upgrade` into a new data directory. The `postgres:13`
image can't be upgraded in place.

---

## 5. Expensive operations

Ordered by expected impact. "Hot path" means it runs during normal annotation work.

| # | Operation | Where | Problem | Fix |
|---|---|---|---|---|
| 1 | Task stats | `annotation_tasks.get_stats` | Loaded every task and badge into Python | **Done (PR 1).** With §1.2 it becomes a plain `GROUP BY` |
| 2 | Refetch after each edit | Frontend mutations | Every click refetched index, stats and lists | **Done (PR 2)** |
| 3 | Navigation index (hot path) | `GET /annotation_tasks/index`, `pageSize = -1` | Filters, joins and sorts the whole project, returns every row | **Partly done (PR 1).** With §1.1 and §1.2 the sort and status filter use indexes. If still slow, load a window around the current task |
| 4 | Page totals (hot path) | `count(*) OVER ()` in [utils.py](../back/src/sonari/api/common/utils.py) | Builds the entire filtered set to count it | Above about 10k matches, return an estimate or "10,000+" |
| 5 | Night/day filter | [routes/annotation_tasks.py:24](../back/src/sonari/routes/annotation_tasks.py#L24) | Python, after pagination; wrong totals; ignored by the index | PR 3 (`is_night` / `is_day` columns) |
| 6 | Stats export, PROBAT export, Multibase export | [exports/data/query_builder.py:53](../back/src/sonari/exports/data/query_builder.py#L53) | Loads every task in the selected projects with recording, datasets, badges, users, events, tags, features and notes into memory, unbatched | Aggregate the stats export in SQL. Stream the others in batches like `extract_batch` already does |
| 7 | Species counts per project | [annotation_projects.py:135](../back/src/sonari/api/annotation_projects.py#L135) | Six `count(DISTINCT …)` over task × badge × event × tag. It *is* cached (5 min TTL), but see #8 | With §1.2, a plain `GROUP BY` that's cheap enough without a cache |
| 8 | In-process cache | [cache.py](../back/src/sonari/cache.py) | One global `asyncio.Lock`: computing one project's counts blocks every other cache miss in that worker. Invalidation only reaches the worker that handled the edit, so other workers serve values up to 5 min old | Lock per key. Invalidate across workers (Postgres `LISTEN/NOTIFY`, or a version number in a small table), or drop the cache once #7 is cheap |
| 9 | Tag management list | [tag_management.py:90](../back/src/sonari/api/tag_management.py#L90) | Correlated `count(*)` per tag over all tag links on every list call | Cached counts per tag, refreshed in the background or after imports |
| 10 | Recording and tag search | `ILIKE '%term%'` | Sequential scan | Trigram indexes (§3.2) |
| 11 | Import writes | ecohub `sonari_writer` | Commits per step, ORM per-row inserts, no rollback after an error in a batch | ecohub-side; covered in the import analysis. Sonari helps with §3.1, §3.2 (re-import index) and §4.3 (`synchronous_commit=off`) |
| 12 | Confidence and median filters (lower priority) | [filters/annotation_tasks.py:795, :920](../back/src/sonari/filters/annotation_tasks.py#L795) | Five joins plus `LIKE`; can match the wrong species | §2.1 step 1 (Sonari only) |
| 13 | Frequency filters (lower priority) | [filters/annotation_tasks.py:1042, :1082](../back/src/sonari/filters/annotation_tasks.py#L1042) | JSON parsed per row | §2.2 step 1, if the filters are used on large projects |
| 14 | Event JSON on read (lower priority) | `GeometryType.process_result_value` ([models/base.py:53](../back/src/sonari/models/base.py#L53)) | Pydantic validates the geometry JSON of every loaded event | Fine at page sizes. With §2.2, list endpoints that only need bounds can select the columns instead of the ORM entity |

---

## 6. Rollout

Each step is independent and can be reverted on its own. Order is by benefit per effort.
Steps A–G need no ecohub code change; at most new credentials or pool values.

| Step | Contents | Risk | Downtime |
|---|---|---|---|
| A | §4.2 server settings, §4.3 roles, §4.4 autovacuum, `pg_stat_statements` | Low | Postgres restart |
| B | §4.1 remaining pool settings: `pool_timeout`, ecohub's environment, `max_connections` (pool sizes are done) | Low | App restart |
| C | §3.1 drop redundant indexes, §3.2 trigram and re-import indexes | Low; check `idx_scan` first | None (`CONCURRENTLY`) |
| D | §1.1 `recorded_at`, PR 3 night/day | Low | Short rewrite of `recording` |
| E | §1.2 status flags + trigger, simplify stats/filters/species counts | Medium: trigger logic | None |
| F | §5 #6 exports, #8 cache, #9 tag counts, §1.3 task duration | Low | None |
| G | Postgres 17 | Medium | Dump/restore window |
| **Lower priority: data from ecohub** | | | |
| H | §2.1 step 1: exact confidence name match (Sonari only) | Low; changes results for multi-species events | None |
| I | §2.2 step 1: generated bound columns, if frequency filters are slow; then delete derived feature rows | Medium: table rewrite, extra parse per import insert | Minutes per 10M events |
| J | §2.1 step 2: confidence on the tag link, with ecohub writer and clone changes | Medium: two-project release | None |
| **Originals and history (§7), replaces I** | | | |
| K | §7.2 steps 1–3: geometry columns, bridge trigger, batched backfill, filters on columns | Medium: trigger and backfill on the largest table | None |
| L | §7.3 original and change tables, recording in the routes, tag replace route, task timeline, project stats from the database | Medium: new feature | None (new tables) |
| M | §7.4 GUANO backfill per project, on request | Low | None |
| N | §7.2 steps 4–5 after ecohub raises the `sonari` pin: drop trigger, JSON column and derived feature rows | Medium: needs ecohub on the new pin first | None |

Measure the top 20 queries in `pg_stat_statements` after step A as a baseline, and
compare after each later step. That also decides whether H–J are needed at all.

---

## 7. Originals and edit history

Goal: show per task and per project what reviewers changed compared with the model's
predictions (yolobat, birdedge, anuravox), and who changed it when. The database becomes
the source. The GUANO files are only read once per project, when someone asks for it
(§7.4).

### 7.0 Status and corrections (steps 1–4 done)

**Step 1 (backend) is implemented:** migration `b8d4f0e2a6c3`, the tables
`sound_event_original`, `sound_event_original_tag` and `sound_event_change`, recording
in the five sound event routes and in the bulk tag replace and delete, tag merges moving
history rows, and `GET /annotation_tasks/detail/history/`.

**Steps 2–4 are implemented:**
- The frontend sends one `X-Sonari-Edit-Id` per event in edit mode, and one per grouped
  action (`runBatch`). The annotate view has an "Edit history" panel, loaded only when opened.
- The project overview's "Correction stats" read the database
  (`GET /annotation_projects/detail/prediction_history/`) instead of the GUANO files. A
  prediction is an imported event with a detector confidence. Without an original, the
  confidence feature names (`detection_confidence:<species>`) give the predicted species,
  so earlier relabels that kept the confidence show up without a backfill.
- "Load predictions from GUANO" starts the backfill
  (`POST …/prediction_history/backfill/`, migration `c9e5a1f3b7d4`, table
  `prediction_backfill`). It runs as a background task, commits every 50 tasks, refuses
  match rates below 80 %, and skips tasks that already have GUANO originals on a rerun.

Still open: the corrections CSV export reads the GUANO files at runtime; §7.2 geometry
columns.

Corrections to the assumptions below, found while implementing:
- **Edits change the owner.** Every geometry or tag edit calls `mark_as_edited_by_user`,
  which sets `created_by_id` to the editor and deletes the confidence features (except
  for the users `birdedge` and `yolobat`). The original is therefore copied *before* that
  call; it's the only place where the detector owner and the confidence survive.
- **Reprocessing doesn't delete edited events.** ecohub deletes only events still owned by
  the detector user, so edited events survive. The "replaced by reprocessing" outcome
  doesn't occur and is dropped. Side effect for ecohub: re-adding detections next to
  surviving edited events probably creates duplicates.
- **Bulk edits** (`/annotation_tasks/bulk/sound_event_tags/replace/`,
  `/annotation_tasks/bulk/sound_events/delete/`) also change events. They record history
  set-wise, one edit id per request. A bulk replace records every removed tag as
  replaced by the new tag.
- **Edit sessions (decided):** every change is saved immediately. The frontend sends one
  `X-Sonari-Edit-Id` per edit-mode session; the history keeps the net effect per event and
  session (resizes merge, remove + add with the same key, or species ↔ group, becomes a
  replacement, add + remove cancels). Without the header, each request is its own edit.
- **SQLite reuses ids** after deleting the newest row. The migration rebuilds
  `sound_event_annotation` on SQLite once with `AUTOINCREMENT`; Postgres is unchanged.

### 7.1 Decisions

| Question | Decision |
|---|---|
| What is the "before" state? | **Copied on first edit, for every imported event.** Just before a user first changes or deletes an event that came from an import (any owner, not only the detector user), Sonari stores the event's state at that moment in `sound_event_original`. Events created in Sonari need no copy: their `created` history row is their original. Events nobody touched are their own original. |
| How detailed is the history? | **Log of user edits.** One row per change made through Sonari's routes, with user, time, and before/after. ecohub's imports write no history rows. |
| How are tags stored? | **As first-class history rows.** Replacing a tag is one `tag_replaced` row with the old and the new tag, not a removal plus an addition. Each row keeps the tag id *and* the tag's key and value as text, so the history stays readable after tag merges and deletions (§7.3). |
| Geometry | **Columns, JSON dropped later** (§7.2). |
| ecohub reprocessing | **Allowed to delete as today.** Originals and history survive the deletion, and the task view shows that a run replaced the events. |
| GUANO backfill | **Background task in the app**, restartable (§7.4). |

Facts these rely on (dev database, ecohub at the time of writing):
- ecohub doesn't call Sonari's HTTP API. It writes with Sonari's own ORM models from the
  `sonari` package pinned in ecohub's `pyproject.toml` (`tag = "2026.7.1"`). A schema change
  reaches ecohub only when that pin is raised.
- Model events are owned by a user named after the detector (`yolobat`: 4,419 events,
  `birdedge`: 12). User edits keep that owner. The project name gives the detector
  (`parse_project_name`), so no static list of detector users is needed.
- On reprocessing into an existing project, ecohub deletes all of the detector user's
  events in the task and re-adds them (`sonari_writer._create_event`), including events
  users have relabeled.
- Tag replacement is the most common edit. The frontend does it as two requests per event,
  remove then add (`handleReplaceTagInSoundEventAnnotations` in
  [AnnotateTasks.tsx](../front/src/components/annotation_tasks/AnnotateTasks.tsx)), often for
  many events at once inside one undo step (`runBatch`). The server can't tell a
  replacement from an unrelated removal and addition.
- `POST /tags/merge/` moves links to the target tag and deletes the source tags, across
  all projects.
- All user edits go through [routes/sound_event_annotations.py](../back/src/sonari/routes/sound_event_annotations.py):
  create, update geometry, delete, add tag, remove tag. ecohub uses `api.sound_event_annotations`
  directly, never these routes. Recording history in the routes therefore catches every
  user edit and none of ecohub's writes.
- Dev has only `BoundingBox` (5,676) and `TimeInterval` (110) geometries.

### 7.2 Geometry as columns

Replaces §2.2 step 1 (generated columns). Plain nullable columns avoid the one-time table
rewrite and become the source of truth.

```sql
ALTER TABLE sound_event_annotation
  ADD COLUMN start_time float8,   -- instant: nullable, no default
  ADD COLUMN end_time   float8,
  ADD COLUMN low_freq   float8,   -- NULL for TimeInterval
  ADD COLUMN high_freq  float8;
```

Steps:
1. **Bridge trigger.** A `BEFORE INSERT OR UPDATE OF geometry` trigger fills the four
   columns from the JSON. ecohub keeps writing with its old pinned models, which know
   nothing about the columns, and its rows still get correct values. The cost is one JSON
   parse per insert, only until step 5.
2. **Backfill** existing rows in batches by id range, about 50k rows per transaction,
   from a script outside Alembic. There's no long lock, and the app keeps running.
3. **Read from the columns.** Switch the frequency and time filters, sorting and exports
   from `CAST(geometry AS json)` to the columns. Add indexes only where
   `pg_stat_statements` shows a need, `CONCURRENTLY`.
4. **Sonari's ORM writes the columns.** `geometry` stays accepted as a constructor
   argument and readable as a property built from the columns. ecohub's code
   (`SoundEventAnnotation(geometry=...)`) keeps working unchanged after raising the pin.
5. **After ecohub runs on the new pin:** drop the trigger and the `geometry` column.
   Make `start_time`/`end_time` required with `CHECK (...) NOT VALID`, then `VALIDATE`.
   Neither step blocks writes for long.

The derived feature rows (`low_freq`, `high_freq`, `duration`, `bandwidth`) can be deleted
in step 5 too, after the check in open question 2.

### 7.3 New tables

Event ids are kept as plain integers **without** a foreign key, for two reasons:
- The history must outlive the event when a user or ecohub deletes it.
- ecohub's mass deletes on reprocessing shouldn't get slower because Postgres would
  otherwise have to look up referencing rows. Event ids come from a sequence and are
  never reused.

```sql
-- State of an imported event just before its first user edit.
CREATE TABLE sound_event_original (
  id                        bigserial PRIMARY KEY,
  annotation_task_id        int  NOT NULL REFERENCES annotation_task(id) ON DELETE CASCADE,
  sound_event_annotation_id int  UNIQUE,          -- no FK, see above; NULL if the event was gone before the backfill
  created_by_id             uuid REFERENCES "user"(id),  -- the event's owner, e.g. the detector user
  source                    text NOT NULL,        -- 'first_edit' | 'guano'
  geometry_type             text NOT NULL,
  start_time                float8 NOT NULL,
  end_time                  float8 NOT NULL,
  low_freq                  float8,
  high_freq                 float8,
  created_on                timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON sound_event_original (annotation_task_id);

CREATE TABLE sound_event_original_tag (
  original_id bigint NOT NULL REFERENCES sound_event_original(id) ON DELETE CASCADE,
  tag_id      int    REFERENCES tag(id) ON DELETE SET NULL,
  tag_key     text   NOT NULL,                    -- copy of the tag at that time
  tag_value   text   NOT NULL,
  confidence  float8,                             -- from the detection_/species_confidence feature
  UNIQUE (original_id, tag_key, tag_value)
);
CREATE INDEX ON sound_event_original_tag (tag_id);

-- One row per user edit.
CREATE TABLE sound_event_change (
  id                        bigserial PRIMARY KEY,
  annotation_task_id        int  NOT NULL REFERENCES annotation_task(id) ON DELETE CASCADE,
  sound_event_annotation_id int  NOT NULL,        -- no FK, see above
  user_id                   uuid REFERENCES "user"(id),
  edit_id                   uuid NOT NULL,        -- groups the rows of one user action (one undo step)
  action                    text NOT NULL,        -- created | deleted | geometry_changed | tag_added | tag_removed | tag_replaced
  old_tag_id    int  REFERENCES tag(id) ON DELETE SET NULL,
  old_tag_key   text, old_tag_value text,
  new_tag_id    int  REFERENCES tag(id) ON DELETE SET NULL,
  new_tag_key   text, new_tag_value text,
  old_start_time float8, old_end_time float8, old_low_freq float8, old_high_freq float8,
  new_start_time float8, new_end_time float8, new_low_freq float8, new_high_freq float8,
  created_on                timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON sound_event_change (annotation_task_id, created_on);
CREATE INDEX ON sound_event_change (sound_event_annotation_id);
CREATE INDEX ON sound_event_change (old_tag_id) WHERE old_tag_id IS NOT NULL;
CREATE INDEX ON sound_event_change (new_tag_id) WHERE new_tag_id IS NOT NULL;
```

**Tags in the history.**

| Case | Stored as |
|---|---|
| Tag added / removed | `tag_added` with `new_tag_*`, `tag_removed` with `old_tag_*` |
| Tag replaced | one `tag_replaced` row with `old_tag_*` and `new_tag_*` |
| Replaced on 40 events at once | 40 `tag_replaced` rows sharing one `edit_id`, shown as one entry ("A → B on 40 events") |
| Tag merged (`/tags/merge/`) | the merge rewrites `tag_id`/`old_tag_id`/`new_tag_id` to the target tag, so stats group under the surviving tag. The key and value text keep what the reviewer actually saw. |
| Tag deleted | `ON DELETE SET NULL` on the ids; the key and value text remain. Deleting tags isn't blocked. |

The tag id is for grouping and joins ("most corrected species"). The text is for showing
history that is still correct after merges and deletions. The partial indexes on the tag
ids keep merges and deletions from scanning the history.

**Replacing a tag in one request.** A new route
`POST /sound_event_annotations/tags/replace/` takes a list of events, the old tag and the
new tag, and an `edit_id`. In one transaction it swaps the tag on each event, copies the
originals where needed and writes one `tag_replaced` row per event.
`handleReplaceTagInSoundEventAnnotations` and the group replacement switch to it. Undo
calls the same route with the tags swapped. A replacement on 40 events becomes one request
instead of 80, which also takes load off the database during review.

The other routes accept an optional `edit_id` (request header `X-Sonari-Edit-Id`, set by
`runBatch`) so that batched removals or deletions group the same way. Without it, every
request gets its own id.

**Writing.** A small service called from the routes, in the same transaction as the edit:
1. If the event has no `created` history row (it came from an import) and no original
   yet, insert the original and its tags (with confidence from the features) from the
   state *before* the edit.
2. Insert the history rows.

This adds two to four small inserts per edited event, and nothing during imports.

**Reading.**

| Outcome | How it's derived |
|---|---|
| confirmed | model event without an original, or with an original equal to its current state |
| relabeled | original's tag differs from the current tag, usually from a `tag_replaced` row |
| tag removed / box changed | original differs from the current event |
| deleted by a user | original plus a `deleted` history row |
| replaced by reprocessing | original whose event no longer exists and no `deleted` history row |
| added | event with a `created` history row, or owned by a human user |

"Model event" means `created_by_id` is the project's detector user. Originals of other
imported events (for example from a manual import) are kept and appear in the task
history, but don't count in the model stats.

- **Task view:** the timeline is `sound_event_change` grouped by `edit_id`, ordered by
  time. "Model vs. now" is the originals next to the current events. Both are index
  lookups on `annotation_task_id`.
- **Project stats and export:** one SQL aggregate over tasks that are completed or
  verified, counting the outcomes above by species. "Most corrected species" and "A was
  most often replaced by B" are a `GROUP BY old_tag_id, new_tag_id` over `tag_replaced`
  rows. The GUANO reads from §2.3 go away.
- **Confidence per species** (mean/median of overwritten predictions) comes from
  `sound_event_original_tag.confidence`, so the threshold suggestion becomes a query.

**After reprocessing**, the re-added events are new, untouched model events, so they
count as confirmed until a user edits them again. The task view marks the task as
"replaced by run", so reviewers can see that.

### 7.4 GUANO backfill on request

For edits made before §7.3 ships, the original predictions can only come from the GUANO
files.
- A "Load predictions from GUANO" action per project starts the backfill. It reuses the
  matching in [prediction_corrections.py](../back/src/sonari/services/prediction_corrections.py)
  (exact box first, then IoU ≥ 0.3).
- **Only tasks that are completed or verified** are read, as today.
- **A matched detection** whose event differs and has no `first_edit` original gets an
  original with `source = 'guano'`. Existing `first_edit` originals are kept.
- **An unmatched detection** gets an original with `sound_event_annotation_id = NULL`,
  counted as "deleted before history started".
- The backfill writes no `sound_event_change` rows: who changed what, and when, before
  §7.3 isn't known. Those tasks show "model vs. now" without a timeline.

**How it runs (decided):** as a FastAPI background task in the app, not as a separate job
queue.
- **Commits per task**, so a worker restart loses at most one task's work.
- **Restartable:** a rerun skips tasks that already have `guano` originals. If a worker
  restarts mid-run, clicking the action again continues where it stopped.
- **One run per project:** the project row stores `predictions_backfill_state`
  (`running`/`done`/`failed`), start and end time, and the match rate. The action is
  refused while the state is `running` and was updated in the last few minutes, so a
  dead run doesn't block a new one forever. The overview shows the state.
- **Cost:** one small file read per reviewed recording (§2.3: 0.06–0.4 ms per file from
  cache, roughly 5–10 ms on spinning disks), in a thread so the event loop stays free.
  20,000 reviewed recordings take seconds on SSD and a few minutes on HDD.
- The same function is callable from a CLI command, for running it on a server without
  the UI. That needs no extra infrastructure.

### 7.5 What ecohub has to do

Nothing for §7.3 and §7.4. For §7.2 step 5: raise the `sonari` pin, with no code change
if the `geometry=` constructor argument is kept. Optional later: copy the new columns
in `_clone_annotations_from_project`, so that deduplicated projects keep their bounds.
Originals and history don't need copying: a cloned project starts without edits.

## Open questions

1. **Production host size:** the memory figures in §4.2 assume about 8 GB for Postgres.
2. **Are the derived feature rows used outside Sonari** (Grafana dashboards, ecohub,
   external exports)? Grafana has its own read role on this database
   (`etc/sonari-db/grafana-select-grants.sql` in the backend deployment folder), so check
   its queries before deleting rows or tables.
3. **Multi-species events (§2.1 step 1):** matching confidence per species changes filter
   results for events with several species tags. Confirm with the people who use the
   confidence filters that the per-species behaviour is what they expect.
4. **Confidence for non-species tags (§2.1 step 2):** fall back to the event's maximum
   confidence, or match only per-tag confidence?
5. **Generated columns vs. ecohub-computed values (§2.2):** generated columns need no
   ecohub change and can't drift out of sync, but they add a parse to every import insert
   and rewrite the table once. The alternative is for ecohub to write the bounds directly,
   which needs a coordinated release.
