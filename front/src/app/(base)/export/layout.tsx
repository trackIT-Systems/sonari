"use client";
import { type ReactNode } from "react";

import ExportHeader from "@/components/export/ExportHeader";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-col h-screen">
      <div className="flex-none">
        <ExportHeader />
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-auto p-4">
        {children}
      </div>
    </div>
  );
}
