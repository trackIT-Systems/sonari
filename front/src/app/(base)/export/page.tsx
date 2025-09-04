"use client";

import Card from "@/components/Card";
import Link from "@/components/Link";

export default function ExportPage() {
  return (
    <div className="container mx-auto p-16">
      <div className="flex flex-col gap-4">
        <h1 className="text-center text-6xl">
          <span className="text-5xl font-thin">
            Choose Your Export Format
          </span>
        </h1>
        <h2 className="text-center text-2xl text-stone-500 dark:text-stone-400">
          Select the export format that best fits your workflow
        </h2>
      </div>
      <div className="pt-16">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-8">
          <Card className="p-6 justify-between">
            <h2 className="text-2xl font-bold mb-4">
                MultiBase
            </h2>
            <p className="text-sm mb-4">
              Export your annotation data in MultiBase format, optimized for biodiversity 
              databases and species occurrence records.
            </p>
            <Link
              mode="text"
              href="/export/multibase/"
              className="text-sm underline font-bold"
            >
              Export MultiBase
            </Link>
          </Card>
          <Card className="p-6 justify-between">
            <h2 className="text-2xl font-bold mb-4">
                Passes
            </h2>
            <p className="text-sm mb-4">
              Export passes, i.e., if the number of events exceeds a threshold per defined time.
            </p>
            <Link
              mode="text"
              href="/export/passes/"
              className="text-sm underline font-bold"
            >
              Export Passes
            </Link>
          </Card>
          <Card className="p-6 justify-between">
            <h2 className="text-2xl font-bold mb-4">
                Statistics
            </h2>
            <p className="text-sm mb-4">
              Export recording-level statistics such as number of recordings per tag and total audio duration.
            </p>
            <Link
              mode="text"
              href="/export/stats/"
              className="text-sm underline font-bold"
            >
              Export Statistics
            </Link>
          </Card>
          <Card className="p-6 justify-between">
            <h2 className="text-2xl font-bold mb-4">
                Dump
            </h2>
            <p className="text-sm mb-4">
              Export comprehensive sound event annotation data in CSV format with all features, 
              coordinates, and metadata..
            </p>
            <Link
              mode="text"
              href="/export/dump/"
              className="text-sm underline font-bold"
            >
              Export Dump
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
