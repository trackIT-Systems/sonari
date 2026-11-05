import Empty from "@/components/Empty";
import Info from "@/components/Info";
import { getTagKey } from "@/components/tags/Tag";

import type {
  PredictionCorrectionCount,
  PredictionCorrectionStats,
  PredictionCorrectionTarget,
} from "@/api/annotation_projects";

const OUTCOME_SEGMENTS = [
  {
    key: "confirmed",
    label: "Confirmed",
    className: "bg-emerald-500 dark:bg-emerald-400",
  },
  {
    key: "relabeled",
    label: "Relabeled",
    className: "bg-amber-500 dark:bg-amber-400",
  },
  {
    key: "tag_removed",
    label: "Tag removed",
    className: "bg-stone-400 dark:bg-stone-500",
  },
  {
    key: "event_deleted",
    label: "Event deleted",
    className: "bg-red-500 dark:bg-red-400",
  },
] as const;

type OutcomeKey = (typeof OUTCOME_SEGMENTS)[number]["key"];

function CorrectionRow({
  species,
  maxPredicted,
}: {
  species: PredictionCorrectionCount;
  maxPredicted: number;
}) {
  const widthPercent = (species.predicted / maxPredicted) * 100;
  const details = [
    species.relabeled_to.length > 0
      ? `→ ${species.relabeled_to.map(({ value, count }) => `${value} ${count}`).join(", ")}`
      : null,
    species.box_changed > 0
      ? `${species.box_changed} ${species.box_changed === 1 ? "box" : "boxes"} adjusted`
      : null,
  ].filter(Boolean);

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-4 text-sm">
        <span className="min-w-0 truncate text-stone-700 dark:text-stone-300">
          <span className="font-normal text-stone-500">{species.key}</span>
          <span className="ml-1 font-semibold italic">{species.value}</span>
        </span>
        <span className="shrink-0 tabular-nums text-stone-500">
          {species.confirmed}/{species.predicted} confirmed
        </span>
      </div>
      <div className="h-3 w-full rounded-full bg-stone-100 dark:bg-stone-800">
        <div
          className="flex h-3 overflow-hidden rounded-full transition-all"
          style={{ width: `${widthPercent}%` }}
        >
          {OUTCOME_SEGMENTS.map(({ key, label, className }) => {
            const value = species[key as OutcomeKey];
            if (value <= 0) return null;
            return (
              <div
                key={key}
                className={`h-full ${className}`}
                style={{ width: `${(value / species.predicted) * 100}%` }}
                title={`${label}: ${value}`}
              />
            );
          })}
        </div>
      </div>
      {details.length > 0 && (
        <p className="text-xs text-stone-500">{details.join(" · ")}</p>
      )}
    </div>
  );
}

/** Outcome bars per predicted tag, the legend, and the tags reviewers added. */
export function CorrectionOutcomes({
  species,
  added,
  emptyMessage,
}: {
  species: PredictionCorrectionCount[];
  added: PredictionCorrectionTarget[];
  emptyMessage: string;
}) {
  const maxPredicted = Math.max(...species.map(({ predicted }) => predicted), 1);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-stone-500">
        {OUTCOME_SEGMENTS.map(({ key, label, className }) => (
          <div key={key} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm ${className}`} />
            <span>{label}</span>
          </div>
        ))}
      </div>
      {species.length === 0 ? (
        <Empty padding="p-2">{emptyMessage}</Empty>
      ) : (
        <div className="space-y-3">
          {species.map((species) => (
            <CorrectionRow
              key={getTagKey({ key: species.key, value: species.value })}
              species={species}
              maxPredicted={maxPredicted}
            />
          ))}
        </div>
      )}
      {added.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-semibold text-stone-700 dark:text-stone-300">
            Added by reviewers (not predicted)
          </p>
          <p className="text-sm text-stone-500">
            {added.map(({ key, value, count }) => (
              <span key={getTagKey({ key, value })} className="mr-3 inline-block">
                <span className="italic">{value}</span>{" "}
                <span className="tabular-nums">{count}</span>
              </span>
            ))}
          </p>
        </div>
      )}
    </div>
  );
}

function Summary({ corrections }: { corrections: PredictionCorrectionStats }) {
  const parts = [
    `${corrections.reviewed_tasks} completed or verified ${corrections.reviewed_tasks === 1 ? "task" : "tasks"}`,
    `GUANO detections for ${corrections.recordings_with_source} of ${corrections.recordings} recordings`,
    corrections.detector ? `detector ${corrections.detector}` : null,
    corrections.model_versions.length > 0
      ? `model ${corrections.model_versions.join(", ")}`
      : null,
  ].filter(Boolean);
  return <p className="text-xs text-stone-500">{parts.join(" · ")}</p>;
}

export default function AnnotationProjectCorrectionsChart({
  corrections,
}: {
  corrections: PredictionCorrectionStats;
}) {
  if (corrections.reviewed_tasks === 0) {
    return (
      <Empty padding="p-2">
        No tasks are completed or verified yet. Corrections are compared on reviewed tasks only.
      </Empty>
    );
  }
  if (corrections.recordings_with_source === 0) {
    return (
      <Empty padding="p-2">
        No GUANO detection files were found next to the reviewed recordings.
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      <Summary corrections={corrections} />
      {!corrections.reliable && corrections.match_rate != null && (
        <Info title="Unreliable comparison">
          Only {Math.round(corrections.match_rate * 100)}% of the detector&apos;s events match a
          GUANO detection exactly, so the GUANO files may belong to another run. Treat these numbers
          with caution.
        </Info>
      )}
      <CorrectionOutcomes
        species={corrections.species}
        added={corrections.added}
        emptyMessage="The GUANO files hold no predictions for the reviewed tasks."
      />
    </div>
  );
}
