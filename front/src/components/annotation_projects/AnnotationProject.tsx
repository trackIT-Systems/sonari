import Link from "next/link";
import { type ReactNode } from "react";

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
  return (
    <div className="w-full">
      <div className="px-4 sm:px-0">
        <h3 className="text-base font-semibold leading-7 text-stone-900 dark:text-stone-100">
          <Link
            className="hover:font-bold hover:text-emerald-500"
            href={{
              pathname: "/annotation_projects/detail/",
              query: { annotation_project_uuid: annotationProject.uuid },
            }}
          >
            {annotationProject.name}
          </Link>
        </h3>
      </div>
      <div className="py-2 flex flex-row">
        <Atom
          label="Created on:"
          value={annotationProject.created_on.toDateString()}
        />
      </div>
    </div>
  );
}
