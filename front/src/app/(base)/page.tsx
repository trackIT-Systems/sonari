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
      </div>
      <div className="pt-16">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-8">
          <Card className="p-6 justify-between">
            <h2 className="text-2xl font-bold mb-4">Annotate</h2>
            <p className="text-sm mb-4">
              Annotate audio recordings.
            </p>
            <Link
              mode="text"
              href="/annotation_projects/"
              className="text-sm underline font-bold"
            >
              Annotate
            </Link>
          </Card>
          <Card className="p-6 justify-between">
            <h2 className="text-2xl font-bold mb-4">Export</h2>
            <p className="text-sm mb-4">
              Export your annotations.
            </p>
            <Link
              mode="text"
              href="/export/"
              className="text-sm underline font-bold"
            >
              Export
            </Link>
          </Card>
          <Card className="p-6 justify-between">
            <h2 className="text-2xl font-bold mb-4">Account</h2>
            <p className="text-sm mb-4">
              Edit your account.
            </p>
            <Link
              mode="text"
              href="/profile/"
              className="text-sm underline font-bold"
            >
              Account
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
