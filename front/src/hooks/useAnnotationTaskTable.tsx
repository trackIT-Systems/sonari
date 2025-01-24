import type { AnnotationStatusBadge, AnnotationTask, Clip, Note, Recording, Tag } from "@/types";
import { useMemo } from "react";
import { ColumnDef, getCoreRowModel, useReactTable, createColumnHelper } from "@tanstack/react-table";
import TableHeader from "@/components/tables/TableHeader";
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


export default function useAnnotationTaskTable({
  data,
  pathFormatter = defaultPathFormatter,
  getAnnotationTaskLink,
}: {
  data: AnnotationTask[];
  pathFormatter?: (path: string) => string;
  getAnnotationTaskLink?: (annotationTask: AnnotationTask) => string;
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
          return (
            <TableCell>
              <span className="text-emerald-500 mr-2">
                {row.index + 1}
              </span>
            </TableCell>
          )
        },
      },
      {
        id: "recording",
        header: () => <TableHeader>Recording</TableHeader>,
        enableResizing: true,
        size: 100,
        accessorFn: (row) => row.clip?.recording,
        cell: ({ row }) => {
          const recording = row.getValue("recording") as Recording;
          return (
            <TableCell>
              <Link
                className="hover:font-bold hover:text-emerald-500 focus:ring focus:ring-emerald-500 focus:outline-none"
                href={`/annotation_projects/` + getAnnotationTaskLink?.(row.original) || "#"}
              >
                {pathFormatter(recording.path)}
              </Link>
            </TableCell>
          )
        },
      },
      {
        id: "duration",
        header: () => <TableHeader>Duration</TableHeader>,
        enableResizing: true,
        size: 40,
        accessorFn: (row) => row.clip,
        cell: ({ row }) => {
          const { start_time, end_time } = row.getValue("duration") as Clip
          const duration = ((end_time - start_time) as number).toFixed(2);
          return <TableCell>{duration}</TableCell>;
        },
      },
      {
        id: "sound_event_tags",
        header: () => <TableHeader>Tags</TableHeader>,
        accessorFn: (row) => {
          // Get all sound event tags and count their occurrences
          const soundEventtags = row.clip_annotation?.sound_events?.flatMap(event => event.tags || []) || [];
          const recordingtags = row.clip_annotation?.clip?.recording.tags || [];
          const tags = soundEventtags.concat(recordingtags);
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
        id: "clip_anno_notes",
        header: () => <TableHeader>Notes</TableHeader>,
        enableResizing: true,
        accessorFn: (row) => row.clip_annotation?.notes,
        cell: ({ row }) => {
          const clip_anno_notes = row.getValue("clip_anno_notes") as Note[];
          if ((clip_anno_notes || []).length == 0) return null;

          return <TableCell>
            <ul>
              {clip_anno_notes.map((note) => (
                <NoteOverview
                  key={note.uuid}
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
    [getAnnotationTaskLink, pathFormatter],
  );
  return useReactTable<AnnotationTask>({
    data,
    columns,
    columnResizeMode: "onChange",
    getCoreRowModel: getCoreRowModel(),
  });
}
