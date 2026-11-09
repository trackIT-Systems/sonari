import { useEffect, useMemo, useState } from "react";

import Button from "@/components/Button";
import { CloseIcon } from "@/components/icons";
import ReferenceCallTile, { TILE_WIDTH } from "@/components/reference_calls/ReferenceCallTile";
import useAnnotationProjectSpeciesCounts from "@/hooks/api/useAnnotationProjectSpeciesCounts";
import useReferenceCalls from "@/hooks/api/useReferenceCalls";

import type { ReferenceCalls } from "@/api/annotation_projects";
import type { SpeciesTag } from "@/components/reference_calls/usePinnedReferenceSpecies";

export const REFERENCE_CALLS = 20;

const numberFormat = new Intl.NumberFormat();

function sameTag(a: SpeciesTag | null | undefined, b: SpeciesTag | null | undefined) {
  return a != null && b != null && a.key === b.key && a.value === b.value;
}

function SearchStatus({ references, running }: { references: ReferenceCalls; running: boolean }) {
  const { job, recordings, searched_recordings, measured_calls, total_calls, calls } = references;
  if (running && job) {
    return (
      <div className="flex flex-col gap-1">
        <span>
          Searching for reference calls…{" "}
          {numberFormat.format(job.done)}
          {job.total > 0 ? ` of ${numberFormat.format(job.total)}` : ""} calls measured.
        </span>
        <div className="h-1.5 w-64 overflow-hidden rounded bg-stone-200 dark:bg-stone-700">
          <div
            className="h-full bg-emerald-500 transition-[width]"
            style={{ width: job.total > 0 ? `${(100 * job.done) / job.total}%` : "5%" }}
          />
        </div>
      </div>
    );
  }
  if (recordings === 0) {
    return <span>No calls of this species are drawn as boxes in this project.</span>;
  }
  if (searched_recordings === 0) {
    return (
      <span>
        {numberFormat.format(total_calls)} calls in {numberFormat.format(recordings)} recordings. Finding the
        references measures only a sample of them.
      </span>
    );
  }
  return (
    <span>
      {calls.length > 0 ? `Best ${calls.length} calls` : "No calls could be measured"}, one per recording where
      possible: from {numberFormat.format(measured_calls)} of {numberFormat.format(total_calls)} calls measured in{" "}
      {numberFormat.format(searched_recordings)} of {numberFormat.format(recordings)} recordings.
      {job?.state === "failed" && <span className="text-red-600"> The last search failed: {job.error}</span>}
      {job?.state === "running" && job.stale && (
        <span className="text-amber-600"> The last search stopped without finishing.</span>
      )}
      {job?.state === "done" && job.failed > 0 && (
        <span className="text-amber-600"> {numberFormat.format(job.failed)} calls could not be read.</span>
      )}
    </span>
  );
}

/**
 * Reference calls of one species in a project, side by side: the clearest, loudest call
 * of each of the best recordings. Finding them measures only a sample of the calls;
 * searching again looks at further recordings. Can be pinned to stay on the tasks page.
 */
export default function ReferenceCallsPanel({
  annotationProjectId,
  initialSpecies,
  pinned,
  onPinnedChange,
  onClose,
}: {
  annotationProjectId: number;
  /** Species to show first, e.g. the one the task list is filtered by */
  initialSpecies: SpeciesTag | null;
  /** The pinned species, if any */
  pinned: SpeciesTag | null;
  onPinnedChange: (tag: SpeciesTag | null) => void;
  onClose: () => void;
}) {
  const { speciesCounts } = useAnnotationProjectSpeciesCounts({ annotationProjectId });
  const options = useMemo(
    () =>
      speciesCounts
        .filter((s) => s.count > 0)
        .sort((a, b) => a.key.localeCompare(b.key) || b.count - a.count),
    [speciesCounts],
  );

  const [species, setSpecies] = useState<SpeciesTag | null>(pinned ?? initialSpecies);
  // Without a choice yet, show the most common species
  useEffect(() => {
    if (species == null && options.length > 0) {
      const top = [...options].sort((a, b) => b.count - a.count)[0];
      setSpecies({ key: top.key, value: top.value });
    }
  }, [species, options]);

  const { references, running, find } = useReferenceCalls({
    annotationProjectId,
    tag: species ?? undefined,
    limit: REFERENCE_CALLS,
  });

  const isPinned = sameTag(pinned, species);
  const unsearched = references != null && references.searched_recordings < references.recordings;
  const searchedBefore = references != null && references.searched_recordings > 0;

  return (
    <section
      className="flex flex-col gap-2 rounded-md border border-stone-200 p-3 dark:border-stone-700"
      aria-label="Reference calls"
    >
      <div className="flex flex-row flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold text-stone-700 dark:text-stone-200">Reference calls</h3>
        <select
          className="rounded-md border border-stone-300 bg-stone-50 px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-900"
          value={species ? `${species.key}\u0000${species.value}` : ""}
          onChange={(e) => {
            const [key, value] = e.target.value.split("\u0000");
            setSpecies({ key, value });
          }}
        >
          {species && !options.some((o) => sameTag(o, species)) && (
            <option value={`${species.key}\u0000${species.value}`}>
              {species.key}: {species.value}
            </option>
          )}
          {options.map((o) => (
            <option key={`${o.key}:${o.value}`} value={`${o.key}\u0000${o.value}`}>
              {o.key}: {o.value} ({numberFormat.format(o.count)})
            </option>
          ))}
        </select>
        {species && (unsearched || !searchedBefore) && (
          <Button
            mode={searchedBefore ? "outline" : "filled"}
            variant="primary"
            padding="px-2 py-1"
            disabled={running || find.isPending || references?.recordings === 0}
            onClick={() => find.mutate()}
            title={
              searchedBefore
                ? "Probe recordings not searched yet; the references can only get better"
                : "Measure a sample of the calls and pick the clearest, loudest one per recording"
            }
          >
            {searchedBefore ? "Search more recordings" : "Find reference calls"}
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button
            mode={isPinned ? "filled" : "outline"}
            variant={isPinned ? "success" : "secondary"}
            padding="px-2 py-1"
            disabled={species == null}
            onClick={() => onPinnedChange(isPinned ? null : species)}
            title={isPinned ? "Stop showing these calls on the tasks page" : "Keep these calls on the tasks page"}
          >
            {isPinned ? "Pinned" : "Pin"}
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-stone-500 hover:bg-stone-200 dark:hover:bg-stone-700"
            title="Close"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
      {references && (
        <div className="text-xs text-stone-600 dark:text-stone-400">
          <SearchStatus references={references} running={running} />
        </div>
      )}
      {references && references.calls.length > 0 && (
        <div className="flex flex-row gap-1 overflow-x-auto pb-1" style={{ minHeight: TILE_WIDTH * 0.8 }}>
          {references.calls.map((call, index) => (
            <ReferenceCallTile
              key={call.sound_event_annotation_id}
              call={call}
              rank={index + 1}
              annotationProjectId={annotationProjectId}
            />
          ))}
        </div>
      )}
      <p className="text-[11px] text-stone-500 dark:text-stone-400">
        Ranked by how far each call stands out from the background in its own band (SNR), which does not depend
        on the recorder&apos;s gain; calls that clipped come last. Each call is shown from the channel where it is
        clearest.
      </p>
    </section>
  );
}
