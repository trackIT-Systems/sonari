"use client";
import { type ReactNode } from "react";

import ExportHeader from "@/components/export/ExportHeader";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col h-screen">
      <div className="flex-none">
        <ExportHeader />
      </div>
      <div className="flex-1 p-4 min-h-0 overflow-auto">
        {children}
      </div>
    </div>
  );
}
