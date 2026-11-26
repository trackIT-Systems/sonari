import { fireEvent, render } from "@testing-library/react";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { describe, expect, it, vi } from "vitest";

import Table from "./Table";

type Row = { id: number };

function TestTable({ onSelect }: { onSelect: (row: Row) => void }) {
  const table = useReactTable<Row>({
    data: [{ id: 1 }, { id: 2 }],
    columns: [{ id: "id", header: "id", accessorFn: (row) => row.id }],
    getCoreRowModel: getCoreRowModel(),
  });
  return <Table table={table} selectedIndex={0} onSelect={onSelect} onFocusChange={() => {}} handleNumberKeys />;
}

describe("Table keys that open a row", () => {
  // Opening a row opens a new tab, which gets the key's release: the table
  // never sees the keyup between two presses.
  it("opens on each Enter press, even without the key's release in between", () => {
    const onSelect = vi.fn();
    render(<TestTable onSelect={onSelect} />);
    fireEvent.keyDown(window, { key: "Enter" });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it("opens on each number key press, even without its release in between", () => {
    const onSelect = vi.fn();
    render(<TestTable onSelect={onSelect} />);
    fireEvent.keyDown(window, { key: "2" });
    fireEvent.keyDown(window, { key: "2" });
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenLastCalledWith({ id: 2 });
  });

  it("does not open again while the key is held (auto-repeat)", () => {
    const onSelect = vi.fn();
    render(<TestTable onSelect={onSelect} />);
    fireEvent.keyDown(window, { key: "Enter" });
    fireEvent.keyDown(window, { key: "Enter", repeat: true });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
