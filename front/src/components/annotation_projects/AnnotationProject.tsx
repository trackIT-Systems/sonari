import Link from "next/link";
import { type ReactNode } from "react";

import useAnnotationProjectProgress from "@/hooks/api/useAnnotationProjectProgress";

import ProgressBar from "../ProgressBar";

import type { AnnotationProject as AnnotationProjectType } from "@/types";

function Atom({ label, value }: { label: ReactNode; value: string }) {
  return (
    <div className="flex flex-row space-x-1">
      <div className="text-sm font-medium text-stone-500">{label}</div>
      <div className="text-sm text-stone-700 dark:text-stone-300">{value}</div>
    </div>
  );
}

export default function AnnotationProject({
  annotationProject,
}: {
  annotationProject: AnnotationProjectType;
}) {
  const { progress: rawProgress, isLoading } = useAnnotationProjectProgress({
    annotationProjectId: annotationProject.id,
  });

  // Transform the raw progress data to match the ProgressBar component's expected format
  const progress = rawProgress
    ? {
        total: rawProgress.total,
        done: {
          count: rawProgress.total - rawProgress.pending,
          verified: rawProgress.verified,
          completed: rawProgress.completed,
          rejected: rawProgress.rejected,
        },
        pending: {
          count: rawProgress.pending,
          assigned: rawProgress.assigned,
        },
      }
    : {
        total: 0,
        done: {
          count: 0,
          verified: 0,
          completed: 0,
          rejected: 0,
        },
        pending: {
          count: 0,
          assigned: 0,
        },
      };

  return (
    <div className="w-full">
      <div className="px-4 sm:px-0">
        <h3 className="text-base font-semibold leading-7 text-stone-900 dark:text-stone-100">
          <Link
            className="hover:font-bold hover:text-emerald-500"
            href={{
              pathname: "/annotation_projects/detail/",
              query: { annotation_project_id: annotationProject.id },
            }}
          >
            {annotationProject.name}
          </Link>
        </h3>
      </div>
      <div className="py-2 flex flex-row items-center gap-12">
        <div>
          <ProgressBar progress={progress} loading={isLoading} className="h-2" />
        </div>
        <Atom
          label="Created on:"
          value={annotationProject.created_on.toDateString()}
        />
      </div>
    </div>
  );
}
