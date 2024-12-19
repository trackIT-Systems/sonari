import { useCallback, useMemo } from "react";
import { type KeyboardEvent } from "react";

import { type RecordingFilter, type RecordingUpdate } from "@/api/recordings";
import Loading from "@/app/loading";
import FilterBar from "@/components/filters/FilterBar";
import FilterPopover from "@/components/filters/FilterMenu";
import recordingFilterDefs from "@/components/filters/recordings";
import Search from "@/components/inputs/Search";
import Pagination from "@/components/lists/Pagination";
import SelectedMenu from "@/components/tables/SelectedMenu";
import Table from "@/components/tables/Table";
import { parsePosition } from "@/components/tables/TableMap";
import useRecordings from "@/hooks/api/useRecordings";
import useRecordingTable from "@/hooks/useRecordingTable";
import useStore from "@/store";

import type { Recording, Tag } from "@/types";

const EDITABLE_COLUMNS = ["date", "time", "location", "tags"];

export default function RecordingTable({
  filter,
  fixed,
  getRecordingLink,
  pathFormatter,
}: {
  filter: RecordingFilter;
  fixed?: (keyof RecordingFilter)[];
  getRecordingLink?: (recording: Recording) => string;
  pathFormatter?: (path: string) => string;
}) {
  const recordings = useRecordings({ filter, fixed });

  const table = useRecordingTable({
    data: recordings.items,
    getRecordingLink,
    pathFormatter,
    onUpdate: recordings.updateRecording.mutate,
    onAddTag: recordings.addTag.mutate,
    onRemoveTag: recordings.removeTag.mutate,
  });

  const { rowSelection } = table.options.state;
  const handleTagSelected = useCallback(
    async (tag: Tag) => {
      if (rowSelection == null) return;
      for (const index of Object.keys(rowSelection)) {
        if (!rowSelection[index]) continue;
        const recording = recordings.items[Number(index)];
        await recordings.addTag.mutateAsync({
          recording,
          tag,
          index: Number(index),
        });
      }
    },
    [rowSelection, recordings.addTag, recordings.items],
  );

  const handleDeleteSelected = useCallback(async () => {
    if (rowSelection == null) return;
    for (const index of Object.keys(rowSelection)) {
      if (!rowSelection[index]) continue;
      const recording = recordings.items[Number(index)];
      await recordings.deleteRecording.mutateAsync({
        recording,
        index: Number(index),
      });
    }
  }, [rowSelection, recordings.items, recordings.deleteRecording]);

  if (recordings.isLoading || recordings.data == null) {
    return <Loading />;
  }

  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex flex-row justify-between space-x-4">
        <div className="flex flex-row space-x-3 basis-1/2">
          <div className="grow">
            <Search
              label="Search"
              placeholder="Search recordings..."
              value={recordings.filter.get("search") ?? ""}
              onChange={(value) =>
                recordings.filter.set("search", value as string)
              }
            />
          </div>
          <FilterPopover
            filter={recordings.filter}
            filterDef={recordingFilterDefs}
          />
        </div>
        <SelectedMenu
          selected={Object.keys(rowSelection ?? {}).length}
          onTag={handleTagSelected}
          onDelete={handleDeleteSelected}
        />
      </div>
      <FilterBar
        filter={recordings.filter}
        total={recordings.total}
        filterDef={recordingFilterDefs}
      />
      <div className="w-full">
        <div className="overflow-x-auto overflow-y-auto w-full max-h-screen rounded-md outline outline-1 outline-stone-200 dark:outline-stone-800">
          <Table table={table} />
        </div>
      </div>
      <Pagination {...recordings.pagination} />
    </div>
  );
}
