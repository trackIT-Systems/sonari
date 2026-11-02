import { Fragment, useCallback, useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { flexRender } from "@tanstack/react-table";
import { useKeyPressEvent } from "react-use";
import useKeyFilter from "@/hooks/utils/useKeyFilter";
import {
  LIST_ELEMENT_UP_SHORTCUT,
  LIST_ELEMENT_DOWN_SHORTCUT,
  SELECT_LIST_ELEMENT_SHORTCUT,
  SELECT_FST_ELEMENT_SHORTCUT,
  SELECT_SND_ELEMENT_SHORTCUT,
  SELECT_TRD_ELEMENT_SHORTCUT,
  SELECT_FRT_ELEMENT_SHORTCUT,
} from "@/utils/keyboard";

import { getScrollParent } from "@/utils/focus";

import type { Column, RowSelectionState, Table } from "@tanstack/react-table";

type TableColumnLayoutMeta = {
  width?: string;
  minWidth?: string;
  maxWidth?: string;
};

function columnLayoutStyle<S>(column: Column<S, unknown>): CSSProperties {
  const meta = column.columnDef.meta as TableColumnLayoutMeta | undefined;
  if (meta?.width || meta?.minWidth || meta?.maxWidth) {
    return {
      width: meta.width,
      minWidth: meta.minWidth,
      maxWidth: meta.maxWidth,
    };
  }
  return { width: `${column.getSize()}%` };
}

/** A Table component.
 * Will display a table.
 * We use the `@tanstack/react-table` library to manage the table state.
 * and column definitions.
 * This defines the basic aspect of the table, while the actual content
 * and cell rendering is controlled by the `table` prop.
 * @component
 */
export default function Table<S>({
  table,
  onCellKeyDown,
  selectedIndex = -1,
  onFocusChange,
  onSelect,
  handleNumberKeys = true,
  getRowClassName,
  onRowClick,
  renderExpandedRow,
  dragSelect = false,
  arrowKeys = true,
}: {
  table: Table<S>;
  onCellKeyDown?: ({
    data,
    row,
    column,
    event,
  }: {
    data: S;
    row: number;
    column: string;
    value: any;
    event: KeyboardEvent;
  }) => void;
  selectedIndex?: number;
  onFocusChange?: (index: number) => void;
  onSelect?: (row: S) => void;
  handleNumberKeys?: boolean;
  getRowClassName?: (row: S) => string | undefined;
  onRowClick?: (row: S, info: { index: number; event: React.MouseEvent }) => void;
  /** Content rendered in a full-width sub-row below the row, or null for none */
  renderExpandedRow?: (row: S) => ReactNode | null;
  /** Click and drag over rows to select (or deselect) a range of rows */
  dragSelect?: boolean;
  /** Handle ArrowUp/ArrowDown row movement here. Turn off when the parent owns the cursor. */
  arrowKeys?: boolean;
}) {
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const suppressClickRef = useRef(false);

  // Stop an active drag if the table unmounts
  useEffect(() => () => dragCleanupRef.current?.(), []);

  const startDragSelect = useCallback(
    (event: React.MouseEvent<HTMLTableRowElement>, startId: string) => {
      if (event.button !== 0) return;
      if ((event.target as HTMLElement).closest("a, button, input, label")) return;

      const base: RowSelectionState = { ...table.getState().rowSelection };
      const mode = base[startId] ? "deselect" : "select";
      const scrollParent = getScrollParent(event.currentTarget);
      const pointer = { x: event.clientX, y: event.clientY };
      let moved = false;
      let frame = 0;
      let lastRange = "";

      const rowIdAt = (x: number, y: number): string | null => {
        for (const el of document.elementsFromPoint(x, y)) {
          const tr = el.closest<HTMLElement>("tr[data-row-id], tr[data-expanded-row-for]");
          if (tr) return tr.dataset.rowId ?? tr.dataset.expandedRowFor ?? null;
        }
        return null;
      };

      const tick = () => {
        // Auto-scroll near the edges of the scroll area
        const top = scrollParent ? scrollParent.getBoundingClientRect().top : 0;
        const bottom = scrollParent ? scrollParent.getBoundingClientRect().bottom : window.innerHeight;
        const edge = 56;
        let dy = 0;
        if (pointer.y < top + edge) dy = -Math.min(24, (top + edge - pointer.y) / 2);
        else if (pointer.y > bottom - edge) dy = Math.min(24, (pointer.y - (bottom - edge)) / 2);
        if (dy !== 0) {
          if (scrollParent) scrollParent.scrollBy({ top: dy });
          else window.scrollBy({ top: dy });
        }

        const currentId = rowIdAt(pointer.x, pointer.y);
        if (currentId != null && (moved || currentId !== startId)) {
          if (!moved) {
            moved = true;
            document.body.style.userSelect = "none";
            window.getSelection()?.removeAllRanges();
          }
          const ids = table.getRowModel().rows.map((r) => r.id);
          const a = ids.indexOf(startId);
          const b = ids.indexOf(currentId);
          const range = `${Math.min(a, b)}:${Math.max(a, b)}`;
          if (a >= 0 && b >= 0 && range !== lastRange) {
            lastRange = range;
            const next: RowSelectionState = { ...base };
            for (const id of ids.slice(Math.min(a, b), Math.max(a, b) + 1)) {
              if (mode === "select") next[id] = true;
              else delete next[id];
            }
            table.setRowSelection(next);
          }
        }
        frame = requestAnimationFrame(tick);
      };

      const onMove = (e: MouseEvent) => {
        pointer.x = e.clientX;
        pointer.y = e.clientY;
      };

      const cleanup = () => {
        cancelAnimationFrame(frame);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        document.body.style.userSelect = "";
        dragCleanupRef.current = null;
      };

      const onUp = () => {
        cleanup();
        if (moved) {
          // The click that follows a drag must not toggle a preview
          suppressClickRef.current = true;
          setTimeout(() => { suppressClickRef.current = false; }, 0);
        }
      };

      dragCleanupRef.current?.();
      dragCleanupRef.current = cleanup;
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      frame = requestAnimationFrame(tick);
    },
    [table],
  );


  useKeyPressEvent(useKeyFilter({ key: LIST_ELEMENT_DOWN_SHORTCUT, enabled: arrowKeys }), (event) => {
    event.preventDefault();
    if (selectedIndex > -1) {
      const newIndex = Math.min(table.getRowModel().rows.length - 1, selectedIndex + 1);
      onFocusChange?.(newIndex);
    }
  });

  useKeyPressEvent(useKeyFilter({ key: LIST_ELEMENT_UP_SHORTCUT, enabled: arrowKeys }), (event) => {
    event.preventDefault();
    if (selectedIndex <= 0) {
      onFocusChange?.(-1);
    } else {
      onFocusChange?.(selectedIndex - 1);
    }
  });

  useKeyPressEvent(useKeyFilter({ key: SELECT_LIST_ELEMENT_SHORTCUT }), () => {
    if (selectedIndex >= 0 && selectedIndex < table.getRowModel().rows.length && onSelect) {
      onSelect(table.getRowModel().rows[selectedIndex].original);
    }
  });

  const handleNumberKey = useCallback((event: KeyboardEvent) => {
    if (!handleNumberKeys || event.metaKey || event.shiftKey) {
      return;
    }

    const index = parseInt(event.key) - 1;
    const rows = table.getRowModel().rows;

    if (index < rows.length && onSelect && onFocusChange) {
      event.preventDefault();
      event.stopPropagation();
      onFocusChange(index);
      onSelect(rows[index].original);
    }
  }, [table, onSelect, onFocusChange, handleNumberKeys]);

  useKeyPressEvent(useKeyFilter({ key: SELECT_FST_ELEMENT_SHORTCUT }), handleNumberKey);
  useKeyPressEvent(useKeyFilter({ key: SELECT_SND_ELEMENT_SHORTCUT }), handleNumberKey);
  useKeyPressEvent(useKeyFilter({ key: SELECT_TRD_ELEMENT_SHORTCUT }), handleNumberKey);
  useKeyPressEvent(useKeyFilter({ key: SELECT_FRT_ELEMENT_SHORTCUT }), handleNumberKey);


  return (
    <table
      className="relative w-full min-w-[52rem] rounded-lg border border-collapse table-fixed border-stone-300 text-stone-700 dark:border-stone-700 dark:text-stone-300"
    >
      <thead className="z-10 sticky top-0 overflow-hidden">
        {table.getHeaderGroups().map((headerGroup) => (
          <tr
            key={headerGroup.id}
            className="bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-300"
          >
            {headerGroup.headers.map((header) => (
              <th
                className="relative overflow-hidden py-1 px-1.5 border border-stone-400 dark:border-stone-500"
                key={header.id}
                colSpan={header.colSpan}
                style={columnLayoutStyle(header.column)}
              >
                {header.isPlaceholder
                  ? null
                  : flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
                {header.column.getCanResize() ? (
                  <div
                    onMouseDown={header.getResizeHandler()}
                    onTouchStart={header.getResizeHandler()}
                    className={`resizer ${header.column.getIsResizing() ? "isResizing" : ""
                      }`}
                  />
                ) : null}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody className="z-0 text-sm text-stone-800 dark:text-stone-300">
        {table.getRowModel().rows.map((row, index) => {
          const expanded = renderExpandedRow?.(row.original);
          const cells = row.getVisibleCells();
          return (
            <Fragment key={row.id}>
              <tr
                data-row-id={row.id}
                onMouseDown={dragSelect ? (event) => startDragSelect(event, row.id) : undefined}
                onClick={onRowClick && ((event) => {
                  if (suppressClickRef.current) return;
                  // Keep links, checkboxes and buttons working as usual
                  if ((event.target as HTMLElement).closest("a, button, input, label")) return;
                  onRowClick(row.original, { index, event });
                })}
                className={`hover:dark:bg-stone-800 hover:bg-stone-200 max-h-40 h-min ${onRowClick ? 'cursor-pointer' : ''} ${index === selectedIndex ? 'bg-stone-200 dark:bg-stone-800' : ''
                  } ${getRowClassName?.(row.original) ?? ''}`}
              >
                {cells.map((cell) => {
                  return (
                    <td
                      role="gridcell"
                      className="border outline-none focus:ring-1 focus:ring-emerald-500 focus:ring-offset-1 focus:ring-offset-transparent border-stone-300 dark:border-stone-600 max-h-40"
                      tabIndex={-1}
                      key={cell.id}
                      style={columnLayoutStyle(cell.column)}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
              {expanded != null && (
                <tr data-expanded-row-for={row.id}>
                  <td colSpan={cells.length} className="border border-stone-300 dark:border-stone-600">
                    {expanded}
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}