import type { ReactNode } from "react";

export type SortDirection = "asc" | "desc" | null;

export default function TableHeader({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block whitespace-nowrap align-middle w-full overflow-x-auto">
      {children}
    </span>
  );
}

function SortIndicator({ direction }: { direction: SortDirection }) {
  if (direction === "asc") {
    return (
      <svg className="w-4 h-4 inline-block ml-1" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
      </svg>
    );
  }
  if (direction === "desc") {
    return (
      <svg className="w-4 h-4 inline-block ml-1" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4 inline-block ml-1 opacity-40" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 3a.75.75 0 01.55.24l3.25 3.5a.75.75 0 11-1.1 1.02L10 4.852 7.3 7.76a.75.75 0 01-1.1-1.02l3.25-3.5A.75.75 0 0110 3zm-3.76 9.2a.75.75 0 011.06.04l2.7 2.908 2.7-2.908a.75.75 0 111.1 1.02l-3.25 3.5a.75.75 0 01-1.1 0l-3.25-3.5a.75.75 0 01.04-1.06z" clipRule="evenodd" />
    </svg>
  );
}

export function SortableTableHeader({
  children,
  sortDirection,
  onSort,
}: {
  children: ReactNode;
  sortDirection: SortDirection;
  onSort: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSort}
      className="inline-flex items-center whitespace-nowrap align-middle w-full overflow-x-auto cursor-pointer hover:text-emerald-500 transition-colors"
    >
      {children}
      <SortIndicator direction={sortDirection} />
    </button>
  );
}
