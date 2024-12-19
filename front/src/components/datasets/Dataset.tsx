import Link from "next/link";
import { type ReactNode } from "react";

import type { Dataset as DatasetType } from "@/types";

export function Atom({ label, value }: { label: ReactNode; value: string }) {
  return (
    <div className="flex flex-row space-x-1">
      <div className="text-sm font-medium text-stone-500">{label}</div>
      <div className="text-sm text-stone-700 dark:text-stone-300">{value}</div>
    </div>
  );
}

export default function Dataset({ dataset }: { dataset: DatasetType }) {
  return (
    <div className="w-full">
      <div className="px-4 sm:px-0">
        <h3 className="text-base font-semibold leading-7 text-stone-900 dark:text-stone-100">
          <Link
            className="hover:font-bold hover:text-emerald-500"
            href={{
              pathname: "/datasets/detail/",
              query: { dataset_uuid: dataset.uuid },
            }}
          >
            {dataset.name}
          </Link>
        </h3>
        <div className="py-2 flex flex-row">
          <Atom
            label="Recordings:"
            value={dataset.recording_count.toString()}
          />
          <span className="px-2"></span>
          <Atom
            label="Created on:"
            value={dataset.created_on.toDateString()}
          />
        </div>
      </div>
    </div>
  );
}
