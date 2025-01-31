"use client";
import Image from "next/image";
import Card from "@/components/Card";
import Link from "@/components/Link";
import { HOST } from "@/api/common";

export default function Page() {
  // For some reason, the SVG path is hardcoded, so we have to get
  // the folder name programmatically...
  return (
    <div className="container mx-auto p-16">
      <div className="flex flex-col gap-4">
        <h1 className="text-center text-7xl">
          <span className="text-6xl font-thin">
            Welcome to
          </span>
          <span className="pl-4 text-emerald-500 decoration-8">
            Sonari
          </span>
        </h1>
        {/* <h2 className="text-center text-3xl text-stone-500 dark:text-stone-500">
          Audio annotation tool with ML in mind!
        </h2> */}
      </div>
      <div className="pt-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-8">
          <Card className="p-6 justify-between">
            <h2 className="text-2xl font-bold mb-4">
              Create and Manage Datasets
            </h2>
            <p className="text-sm mb-4">
              Register new datasets of audio recordings and manage their
              metadata.
            </p>
            <Link
              mode="text"
              href="/datasets/"
              className="text-sm underline font-bold"
            >
              Get Started
            </Link>
          </Card>
          <Card className="p-6 justify-between">
            <h2 className="text-2xl font-bold mb-4">Annotate Audio</h2>
            <p className="text-sm mb-4">
              Handle annotation projects, monitor progress, and export data.
            </p>
            <Link
              mode="text"
              href="/annotation_projects/"
              className="text-sm underline font-bold"
            >
              Start Annotating
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
