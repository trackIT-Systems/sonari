import Button from "@/components/Button";
import Empty from "@/components/Empty";
import Info from "@/components/Info";
import Loading from "@/components/Loading";
import useAnnotationProjectPredictionHistory from "@/hooks/api/useAnnotationProjectPredictionHistory";

import { CorrectionOutcomes } from "./AnnotationProjectCorrectionsChart";

import type { PredictionBackfillStatus } from "@/api/annotation_projects";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" });

function backfillSummary(backfill: PredictionBackfillStatus): string {
  if (backfill.state === "running") {
    return backfill.stale
      ? `The run started ${dateFormat.format(backfill.started_on)} stopped without finishing. Start it again to continue.`
      : `Reading the GUANO files of ${backfill.reviewed_tasks || "the"} reviewed tasks… ${backfill.originals_created} predictions stored so far.`;
  }
  if (backfill.state === "failed") {
    return `The run of ${dateFormat.format(backfill.started_on)} failed: ${backfill.error ?? "unknown error"}`;
  }
  const parts = [
    `Loaded ${dateFormat.format(backfill.finished_on ?? backfill.updated_on)}`,
    `${backfill.originals_created} predictions from GUANO files of ${backfill.recordings_with_source} of ${backfill.recordings} recordings`,
    backfill.match_rate != null ? `${Math.round(backfill.match_rate * 100)} % of untouched events matched` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

function GuanoBackfill({
  backfill,
  onStart,
  isStarting,
}: {
  backfill: PredictionBackfillStatus | null | undefined;
  onStart: () => void;
  isStarting: boolean;
}) {
  const running = backfill?.state === "running" && !backfill.stale;
  return (
    <Info title="Edits from before the edit history">
      <div className="space-y-2">
        <p>
          Sound events edited before Sonari kept an edit history count as drawn by reviewers. Loading the
          detector predictions from the GUANO files next to the recordings fills in what they were before.
          Only completed and verified tasks are read.
        </p>
        {backfill != null && <p className="text-xs">{backfillSummary(backfill)}</p>}
        <Button mode="outline" variant="primary" onClick={onStart} disabled={running || isStarting}>
          {running ? "Loading predictions…" : backfill?.state === "done" ? "Load again" : "Load predictions from GUANO"}
        </Button>
      </div>
    </Info>
  );
}

/** Corrections of predictions in the project's reviewed tasks, from the edit history. */
export default function AnnotationProjectPredictionHistory({
  annotationProjectId,
}: {
  annotationProjectId: number;
}) {
  const { stats, isLoading, error, startBackfill } = useAnnotationProjectPredictionHistory({
    annotationProjectId,
  });

  if (isLoading) return <Loading />;
  if (error != null || stats == null) {
    return <Empty padding="p-2">The correction stats could not be loaded.</Empty>;
  }

  const backfill = (
    <GuanoBackfill
      backfill={stats.backfill}
      onStart={() => startBackfill.mutate()}
      isStarting={startBackfill.isPending}
    />
  );

  if (stats.reviewed_tasks === 0) {
    return (
      <Empty padding="p-2">
        No tasks are completed or verified yet. Corrections are compared on reviewed tasks only.
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-stone-500">
        {stats.reviewed_tasks} completed or verified {stats.reviewed_tasks === 1 ? "task" : "tasks"} ·{" "}
        {stats.predicted_events} predicted sound events · {stats.edited_events} changed by reviewers
      </p>
      {backfill}
      <CorrectionOutcomes
        species={stats.species}
        added={stats.added}
        emptyMessage="The reviewed tasks hold no predicted sound events."
      />
    </div>
  );
}
