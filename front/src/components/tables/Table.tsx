import { useCallback, type CSSProperties } from "react";
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

import type { Column, Table } from "@tanstack/react-table";

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
}) {

  useKeyPressEvent(useKeyFilter({ key: LIST_ELEMENT_DOWN_SHORTCUT }), (event) => {
    event.preventDefault();
    if (selectedIndex > -1) {
      const newIndex = Math.min(table.getRowModel().rows.length - 1, selectedIndex + 1);
      onFocusChange?.(newIndex);
    }
  });

  useKeyPressEvent(useKeyFilter({ key: LIST_ELEMENT_UP_SHORTCUT }), (event) => {
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
          return (
            <tr
              key={row.id}
              className={`hover:dark:bg-stone-800 hover:bg-stone-200 max-h-40 h-min ${index === selectedIndex ? 'bg-stone-200 dark:bg-stone-800' : ''
                }`}
            >
              {row.getVisibleCells().map((cell) => {
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
          );
        })}
      </tbody>
    </table>
  );
}