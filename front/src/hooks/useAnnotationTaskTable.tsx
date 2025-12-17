import type { AnnotationStatusBadge, AnnotationTask, Note, Recording, Tag } from "@/types";
import { useMemo } from "react";
import { ColumnDef, getCoreRowModel, useReactTable, createColumnHelper } from "@tanstack/react-table";
import TableHeader, { SortableTableHeader, SortDirection } from "@/components/tables/TableHeader";
import TableCell from "@/components/tables/TableCell";
import StatusBadge from "@/components/StatusBadge";
import TagComponent, { TagCount, getTagKey } from "@/components/tags/Tag";
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
}: {
  data: AnnotationTask[];
  pathFormatter?: (path: string) => string;
  getAnnotationTaskLink: (annotationProjectId: number, annotationTaskId: number) => string;
  pagination?: { page: number; pageSize: number };
  sortBy?: string;
  onSortChange?: (sortBy: string | undefined) => void;
}) {

  // Column definitions
  const columns = useMemo<ColumnDef<AnnotationTask>[]>(
    () => [
      {
        id: "index",
        header: () => { },
        enableResizing: false,
        size: 1,
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
        enableResizing: true,
        size: 100,
        accessorFn: (row) => row.recording,
        cell: ({ row }) => {
          const recording = row.getValue("recording") as Recording;
          const link = getAnnotationTaskLink(row.original.annotation_project_id, row.original.id);
          const fullHref = link ? `/annotation_projects/${link}` : "#";

          return (
            <TableCell>
              <Link
                className="hover:font-bold hover:text-emerald-500 focus:ring focus:ring-emerald-500 focus:outline-none block break-words"
                href={fullHref}
              >
                {pathFormatter(recording.path)}
              </Link>
            </TableCell>
          )
        },
      },
      {
        id: "task",
        header: () => <TableHeader>Task</TableHeader>,
        enableResizing: true,
        size: 30,
        cell: ({ row }) => {
          const currentTask = row.original;
          if (!currentTask) return <TableCell>-</TableCell>;

          const currentRecordingId = currentTask.recording_id;
          const tasksFromSameRecording = data
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
        enableResizing: true,
        size: 40,
        cell: ({ row }) => {
          const duration = ((row.original.end_time - row.original.start_time) as number).toFixed(2);
          return <TableCell>{duration}</TableCell>;
        },
      },
      {
        id: "task_tags",
        header: () => <TableHeader>Task Tags</TableHeader>,
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
        accessorFn: (row) => {
          const tags = (row.sound_event_annotations || []).flatMap(event => event.tags || []);
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
        id: "task_notes",
        header: () => <TableHeader>Notes</TableHeader>,
        enableResizing: true,
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
        enableResizing: true,
        size: 70,
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
    [getAnnotationTaskLink, pathFormatter, pagination, data, sortBy, onSortChange],
  );
  return useReactTable<AnnotationTask>({
    data,
    columns,
    columnResizeMode: "onChange",
    getCoreRowModel: getCoreRowModel(),
  });
}
