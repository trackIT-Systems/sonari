import { useCallback } from "react";
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

import type { Table } from "@tanstack/react-table";

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
      className="relative min-w-full rounded-lg border border-collapse table-fixed border-stone-300 text-stone-700 dark:border-stone-700 dark:text-stone-300"
      {...{
        style: {
          width: table.getCenterTotalSize(),
        },
      }}
    >
      <thead className="z-10 sticky top-0">
        {table.getHeaderGroups().map((headerGroup) => (
          <tr
            key={headerGroup.id}
            className="bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-300"
          >
            {headerGroup.headers.map((header) => (
              <th
                className="overflow-x-auto relative py-1 px-2 whitespace-nowrap border border-stone-400 dark:border-stone-500"
                key={header.id}
                colSpan={header.colSpan}
                style={{
                  width: header.getSize(),
                }}
              >
                {header.isPlaceholder
                  ? null
                  : flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
                <div
                  onMouseDown={header.getResizeHandler()}
                  onTouchStart={header.getResizeHandler()}
                  className={`resizer ${header.column.getIsResizing() ? "isResizing" : ""
                    }`}
                />
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
                    style={{
                      width: cell.column.getSize(),
                    }}
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