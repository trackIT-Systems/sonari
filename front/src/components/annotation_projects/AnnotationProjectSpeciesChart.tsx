import Card from "@/components/Card";
import Empty from "@/components/Empty";
import { H4 } from "@/components/Headings";
import Loading from "@/components/Loading";
import { getTagKey } from "@/components/tags/Tag";
import useAnnotationProjectSpeciesCounts from "@/hooks/api/useAnnotationProjectSpeciesCounts";

import type { AnnotationProject } from "@/types";

type SpeciesCount = {
  key: string;
  value: string;
  count: number;
  accepted: number;
  verified: number;
  unsure: number;
  rejected: number;
  no_status: number;
};

const STATUS_SEGMENTS = [
  {
    key: "accepted",
    label: "Accepted",
    className: "bg-emerald-500 dark:bg-emerald-400",
  },
  {
    key: "verified",
    label: "Verified",
    className: "bg-blue-500 dark:bg-blue-400",
  },
  {
    key: "unsure",
    label: "Unsure",
    className: "bg-amber-500 dark:bg-amber-400",
  },
  {
    key: "rejected",
    label: "Rejected",
    className: "bg-red-500 dark:bg-red-400",
  },
  {
    key: "no_status",
    label: "No status",
    className: "bg-stone-400 dark:bg-stone-500",
  },
] as const;

type StatusKey = (typeof STATUS_SEGMENTS)[number]["key"];

function SpeciesBarChart({ speciesCounts }: { speciesCounts: SpeciesCount[] }) {
  const maxCount = Math.max(...speciesCounts.map(({ count }) => count), 1);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-stone-500">
        {STATUS_SEGMENTS.map(({ key, label, className }) => (
          <div key={key} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm ${className}`} />
            <span>{label}</span>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {speciesCounts.map((species) => {
          const widthPercent = (species.count / maxCount) * 100;

          return (
            <div
              key={getTagKey({ key: species.key, value: species.value })}
              className="space-y-1"
            >
              <div className="flex items-baseline justify-between gap-4 text-sm">
                <span className="min-w-0 truncate text-stone-700 dark:text-stone-300">
                  <span className="font-normal text-stone-500">{species.key}</span>
                  <span className="ml-1 font-semibold italic">{species.value}</span>
                </span>
                <span className="shrink-0 tabular-nums text-stone-500">
                  {species.count}
                </span>
              </div>
              <div className="h-3 w-full rounded-full bg-stone-100 dark:bg-stone-800">
                <div
                  className="flex h-3 overflow-hidden rounded-full transition-all"
                  style={{ width: `${widthPercent}%` }}
                >
                  {STATUS_SEGMENTS.map(({ key, label, className }) => {
                    const value = species[key as StatusKey];
                    if (value <= 0) return null;
                    const segmentPercent = (value / species.count) * 100;

                    return (
                      <div
                        key={key}
                        className={`h-full ${className}`}
                        style={{ width: `${segmentPercent}%` }}
                        title={`${label}: ${value}`}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AnnotationProjectSpeciesChart({
  annotationProject,
}: {
  annotationProject: AnnotationProject;
}) {
  const { speciesCounts, isLoading } = useAnnotationProjectSpeciesCounts({
    annotationProjectId: annotationProject.id,
  });

  return (
    <Card>
      <H4>Species</H4>
      {isLoading && speciesCounts.length === 0 ? (
        <Loading />
      ) : speciesCounts.length === 0 ? (
        <Empty padding="p-2">
          No species tags have been added to sound events in this project yet.
        </Empty>
      ) : (
        <SpeciesBarChart speciesCounts={speciesCounts} />
      )}
    </Card>
  );
}
