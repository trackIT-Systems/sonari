import type { AnnotationStatusBadge, AnnotationTask, AnnotationTaskIndex, Note, Recording, SoundEventTagStats, Tag } from "@/types";
import { useMemo } from "react";
import {
  ColumnDef,
  getCoreRowModel,
  useReactTable,
  type OnChangeFn,
  type RowSelectionState,
} from "@tanstack/react-table";
import TableHeader, { SortableTableHeader, SortDirection } from "@/components/tables/TableHeader";
import TableCell from "@/components/tables/TableCell";
import Checkbox from "@/components/tables/TableCheckbox";
import StatusBadge from "@/components/StatusBadge";
import TagComponent, { TagCount, getTagKey } from "@/components/tags/Tag";
import Tooltip from "@/components/Tooltip";
import Link from "next/link";
import { NoteIcon } from "@/components/icons";

const defaultPathFormatter = (path: string) => path;

function NoteOverview({
  note,
}: {
  note: Note;
}) {
  return (
    <li className="mb-2 pb-2 border-b border-stone-600 last:border-b-0">
      <NoteIcon className="inline-block w-3 h-3 text-stone-500" />
      <span className="text-sm text-stone-500 pl-2">{note.message}</span>
    </li>
  );
}

function formatConfidence(value: number | null | undefined): string {
  return value == null ? "–" : value.toFixed(2);
}

function TagConfidencePopover({ stats }: { stats?: SoundEventTagStats }) {
  if (!stats) return <span>No sound event data</span>;
  return (
    <div className="flex flex-col gap-0.5">
      <div>
        Median confidence:{" "}
        <span className="font-semibold tabular-nums">{formatConfidence(stats.median_confidence)}</span>
      </div>
      <div>
        Max confidence:{" "}
        <span className="font-semibold tabular-nums">{formatConfidence(stats.max_confidence)}</span>
      </div>
      <div className="text-xs text-stone-500">
        {stats.count} sound event{stats.count === 1 ? "" : "s"} with this tag
      </div>
    </div>
  );
}

/** Parse sort_by string to get direction for a specific column */
function getSortDirection(sortBy: string | undefined, columnId: string): SortDirection {
  if (!sortBy) return null;
  if (sortBy === columnId) return "asc";
  if (sortBy === `-${columnId}`) return "desc";
  return null;
}

/** Toggle sort direction: null -> asc -> desc -> null */
function getNextSortBy(currentSortBy: string | undefined, columnId: string): string | undefined {
  const currentDirection = getSortDirection(currentSortBy, columnId);
  if (currentDirection === null) return columnId;
  if (currentDirection === "asc") return `-${columnId}`;
  return undefined;
}

export default function useAnnotationTaskTable({
  data,
  pathFormatter = defaultPathFormatter,
  getAnnotationTaskLink,
  pagination,
  sortBy,
  onSortChange,
  allTasks,
  rowSelection,
  onRowSelectionChange,
  filterTotal,
  onSelectAllMatchingFilter,
  targetMode,
}: {
  data: AnnotationTask[];
  pathFormatter?: (path: string) => string;
  getAnnotationTaskLink: (annotationProjectId: number, annotationTaskId: number) => string;
  pagination?: { page: number; pageSize: number };
  sortBy?: string;
  onSortChange?: (sortBy: string | undefined) => void;
  allTasks?: AnnotationTaskIndex[];
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  filterTotal?: number;
  onSelectAllMatchingFilter?: () => void;
  targetMode?: "selected" | "filter_all";
}) {

  const allPageSelected =
    data.length > 0 && data.every((task) => rowSelection?.[String(task.id)]);
  const somePageSelected = data.some((task) => rowSelection?.[String(task.id)]);

  // Column definitions
  const columns = useMemo<ColumnDef<AnnotationTask>[]>(
    () => [
      {
        id: "select",
        header: () => (
          <TableHeader>
            <div className="flex flex-col items-start gap-1">
              <Checkbox
                checked={allPageSelected}
                indeterminate={somePageSelected && !allPageSelected}
                onChange={(event) => {
                  const checked = event.target.checked;
                  onRowSelectionChange?.((prev) => {
                    const next = { ...prev };
                    for (const task of data) {
                      const id = String(task.id);
                      if (checked) {
                        next[id] = true;
                      } else {
                        delete next[id];
                      }
                    }
                    return next;
                  });
                }}
                onClick={(event) => event.stopPropagation()}
              />
              {filterTotal != null && onSelectAllMatchingFilter && (
                <button
                  type="button"
                  className={`text-left text-xs leading-tight wrap-break-word max-w-[4.5rem] ${targetMode === "filter_all" ? "font-semibold text-emerald-600" : "text-emerald-600 hover:underline"}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectAllMatchingFilter();
                  }}
                >
                  All {filterTotal} filtered
                </button>
              )}
            </div>
          </TableHeader>
        ),
        enableResizing: false,
        size: 3,
        meta: {
          width: "3rem",
          minWidth: "2.75rem",
          maxWidth: "5rem",
        },
        cell: ({ row }) => (
          <TableCell>
            <Checkbox
              checked={row.getIsSelected()}
              onChange={row.getToggleSelectedHandler()}
              onClick={(event) => event.stopPropagation()}
            />
          </TableCell>
        ),
      },
      {
        id: "index",
        header: () => { },
        enableResizing: false,
        size: 2,
        meta: {
          width: "2.25rem",
          minWidth: "2.25rem",
          maxWidth: "2.75rem",
        },
        accessorFn: () => {},
        cell: ({ row }) => {
          // Calculate the global index across all pages
          const globalIndex = pagination 
            ? (pagination.page * pagination.pageSize) + row.index + 1
            : row.index + 1;
          return (
            <TableCell>
              <span className="text-emerald-500 mr-2">
                {globalIndex}
              </span>
            </TableCell>
          )
        },
      },
      {
        id: "recording",
        header: () => (
          <SortableTableHeader
            sortDirection={getSortDirection(sortBy, "recording")}
            onSort={() => onSortChange?.(getNextSortBy(sortBy, "recording"))}
          >
            Recording
          </SortableTableHeader>
        ),
        enableResizing: false,
        size: 16,
        meta: { width: "16%", minWidth: "6rem" },
        accessorFn: (row) => row.recording,
        cell: ({ row }) => {
          const recording = row.getValue("recording") as Recording;
          const link = getAnnotationTaskLink(row.original.annotation_project_id, row.original.id);
          const fullHref = link ? `/annotation_projects/${link}` : "#";
          const { date, time } = recording ?? {};

          return (
            <TableCell>
              <Link
                className="hover:font-bold hover:text-emerald-500 focus:ring focus:ring-emerald-500 focus:outline-none block break-words text-xs text-stone-600 dark:text-stone-400"
                href={fullHref}
                target="_blank"
                rel="noopener noreferrer"
              >
                {pathFormatter(recording.path)}
              </Link>
              {date && (
                <span className="block text-sm font-semibold whitespace-nowrap">
                  {date.toLocaleDateString()}
                  {time ? ` ${time}` : ""}
                </span>
              )}
            </TableCell>
          )
        },
      },
      {
        id: "task",
        header: () => <TableHeader>Task</TableHeader>,
        enableResizing: false,
        size: 3,
        meta: {
          width: "3.25rem",
          minWidth: "3rem",
          maxWidth: "3.5rem",
        },
        cell: ({ row }) => {
          const currentTask = row.original;
          if (!currentTask) return <TableCell>-</TableCell>;

          const currentRecordingId = currentTask.recording_id;
          const taskSource = allTasks && allTasks.length > 0 ? allTasks : data;

          const tasksFromSameRecording = taskSource
            .filter(task => task.recording_id === currentRecordingId)
            .sort((a, b) => a.start_time - b.start_time);

          const taskIndex = tasksFromSameRecording.findIndex(c => c.id === currentTask.id);
          const totalTasks = tasksFromSameRecording.length;

          return (
            <TableCell>
              <span className="text-stone-500 text-sm">
                {taskIndex >= 0 ? `${taskIndex + 1}/${totalTasks}` : '-'}
              </span>
            </TableCell>
          );
        },
      },
      {
        id: "duration",
        header: () => (
          <SortableTableHeader
            sortDirection={getSortDirection(sortBy, "duration")}
            onSort={() => onSortChange?.(getNextSortBy(sortBy, "duration"))}
          >
            Duration
          </SortableTableHeader>
        ),
        enableResizing: false,
        size: 4,
        meta: {
          width: "4.5rem",
          minWidth: "4.25rem",
          maxWidth: "5rem",
        },
        cell: ({ row }) => {
          const duration = ((row.original.end_time - row.original.start_time) as number).toFixed(2);
          return (
            <TableCell>
              <span className="tabular-nums whitespace-nowrap">{duration}</span>
            </TableCell>
          );
        },
      },
      {
        id: "task_tags",
        header: () => <TableHeader>Task Tags</TableHeader>,
        enableResizing: false,
        size: 12,
        meta: { width: "12%", minWidth: "5rem" },
        accessorFn: (row) => {
          const tags = row.tags || [];
          const tagCounts = new Map<string, TagCount>();

          tags.forEach(tag => {
            const key = `${tag.key}-${tag.value}`;
            const existing = tagCounts.get(key);
            if (existing) {
              existing.count++;
            } else {
              tagCounts.set(key, { tag, count: 1 });
            }
          });

          return Array.from(tagCounts.values());
        },
        cell: (props) => {
          const tagCounts = props.getValue() as Array<{ tag: Tag; count: number }>;
          return (
            <div className="flex flex-wrap gap-1 p-1">
              {tagCounts.map(({ tag, count }) => (
                <TagComponent
                  key={getTagKey(tag)}
                  tag={tag}
                  count={count}
                />
              ))}
            </div>
          );
        },
      },
      {
        id: "sound_event_tags",
        header: () => <TableHeader>Sound Event Tags</TableHeader>,
        enableResizing: false,
        size: 34,
        meta: { width: "34%", minWidth: "16rem" },
        accessorFn: (row) => {
          const tags =
            row.sound_event_tags?.length
              ? row.sound_event_tags
              : (row.sound_event_annotations || []).flatMap((event) => event.tags || []);
          const tagCounts = new Map<string, TagCount>();

          tags.forEach((tag) => {
            const key = `${tag.key}-${tag.value}`;
            const existing = tagCounts.get(key);
            if (existing) {
              existing.count++;
            } else {
              tagCounts.set(key, { tag, count: 1 });
            }
          });

          return Array.from(tagCounts.values());
        },
        cell: (props) => {
          const tagCounts = props.getValue() as Array<{ tag: Tag; count: number }>;
          const statsByTag = new Map(
            (props.row.original.sound_event_tag_stats ?? []).map((stats) => [
              getTagKey(stats),
              stats,
            ]),
          );
          return (
            <div className="flex min-w-0 flex-wrap gap-1 p-1">
              {tagCounts.map(({ tag, count }) => (
                <Tooltip
                  key={getTagKey(tag)}
                  placement="top"
                  portal
                  tooltip={<TagConfidencePopover stats={statsByTag.get(getTagKey(tag))} />}
                >
                  <TagComponent tag={tag} count={count} />
                </Tooltip>
              ))}
            </div>
          );
        },
      },
      {
        id: "task_notes",
        header: () => <TableHeader>Notes</TableHeader>,
        enableResizing: false,
        size: 10,
        meta: { width: "10%", minWidth: "4rem" },
        accessorFn: (row) => row.notes,
        cell: ({ row }) => {
          const taskNotes = row.getValue("task_notes") as Note[];
          if ((taskNotes || []).length == 0) return null;

          return <TableCell>
            <ul>
              {taskNotes.map((note) => (
                <NoteOverview
                  key={note.id}
                  note={note}
                />
              ))}
            </ul>
          </TableCell>
        }
      },
      {
        id: "status",
        header: () => <TableHeader>Status</TableHeader>,
        enableResizing: false,
        size: 9,
        meta: { width: "9%", minWidth: "4.5rem" },
        accessorFn: (row) => row.status_badges,
        cell: ({ row }) => {
          const status = row.getValue("status") as AnnotationStatusBadge[];
          return <TableCell>
            <div className="flex flex-row flex-wrap gap-1">
              {status?.map((badge) => (
                <StatusBadge
                  key={`${badge.state}-${badge.user?.id}`}
                  badge={badge}
                />
              )
              )}
            </div>
          </TableCell>
        },
      },
    ],
    [
      getAnnotationTaskLink,
      pathFormatter,
      pagination,
      data,
      sortBy,
      onSortChange,
      allTasks,
      allPageSelected,
      somePageSelected,
      onRowSelectionChange,
      filterTotal,
      onSelectAllMatchingFilter,
      targetMode,
    ],
  );
  return useReactTable<AnnotationTask>({
    data,
    columns,
    enableColumnResizing: false,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => String(row.id),
    enableRowSelection: true,
    onRowSelectionChange,
    state: rowSelection != null ? { rowSelection } : undefined,
  });
}
