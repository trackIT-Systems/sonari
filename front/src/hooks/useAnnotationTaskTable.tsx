import type {AnnotationStatusBadge, AnnotationTask, Note, Recording, Tag} from "@/types";
import {useMemo} from "react";
import {ColumnDef, getCoreRowModel, useReactTable, createColumnHelper} from "@tanstack/react-table";
import TableHeader from "@/components/tables/TableHeader";
import TableCell from "@/components/tables/TableCell";
import StatusBadge from "@/components/StatusBadge";
import TagComponent from "@/components/tags/Tag";
import { TagCount } from "@/components/tags/Tag";
import useStore from "@/store";
import {SunIcon} from "@/components/icons";
import Link from "next/link";

const defaultPathFormatter = (path: string) => path;

export default function useAnnotationTaskTable({
                                                 data,
                                                 pathFormatter = defaultPathFormatter,
                                                 getAnnotationTaskLink,
                                               }: {
  data: AnnotationTask[];
  pathFormatter?: (path: string) => string;
  getAnnotationTaskLink?: (annotationTask: AnnotationTask) => string;
}) {

  const getTagColor = useStore((state) => state.getTagColor);
  const columnHelper = createColumnHelper<AnnotationTask>();

  const soundEventTagsColumn = columnHelper.accessor(
    (row) => {
      // Get all sound event tags and count their occurrences
      const tags = row.clip_annotation?.sound_events?.flatMap(event => event.tags || []) || [];
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
    {
      id: "sound_event_tags",
      header: "Sound Event Tags",
      cell: (props) => {
        const tagCounts = props.getValue();
        return (
          <div className="flex flex-wrap gap-1 p-1">
            {tagCounts.map(({ tag, count }) => (
              <TagComponent
                key={`${tag.key}-${tag.value}`}
                tag={tag}
                {...getTagColor(tag)}
                count={count}
              />
            ))}
          </div>
        );
      },
    }
  );

  // Column definitions
  const columns = useMemo<ColumnDef<AnnotationTask>[]>(
    () => [
      {
        id: "recording",
        header: () => <TableHeader>Recording</TableHeader>,
        enableResizing: true,
        size: 100,
        accessorFn: (row) => row.clip?.recording,
        cell: ({row}) => {
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
        id: "start",
        header: () => <TableHeader>Start</TableHeader>,
        enableResizing: true,
        size: 30,
        accessorFn: (row) => row.clip?.start_time,
        cell: ({row}) => {
          const start = row.getValue("start") as string;
          return <TableCell>{start}</TableCell>;
        },
      },
      {
        id: "end",
        header: () => <TableHeader>End</TableHeader>,
        enableResizing: true,
        size: 30,
        accessorFn: (row) => row.clip?.end_time,
        cell: ({row}) => {
          const end = row.getValue("end") as string;
          return <TableCell>{end}</TableCell>;
        },
      },
        soundEventTagsColumn,
      {
        id: "clip_anno_notes",
        header: () => <TableHeader>Annotation Notes</TableHeader>,
        enableResizing: true,
        size: 50,
        accessorFn: (row) => row.clip_annotation?.notes,
        cell: ({row}) => {
          const clip_anno_notes = row.getValue("clip_anno_notes") as Note[];
          if ((clip_anno_notes || []).length == 0) return null;

          return (
            <span className="ms-2">
              <SunIcon className="inline-block mr-2 w-5 h-5 text-stone-500 align-middle"/>{clip_anno_notes.length} notes
            </span>
          );
        }
      },
      {
        id: "status",
        header: () => <TableHeader>Status</TableHeader>,
        enableResizing: true,
        size: 100,
        accessorFn: (row) => row.status_badges,
        cell: ({row}) => {
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
    [getAnnotationTaskLink, getTagColor, pathFormatter, soundEventTagsColumn],
  );
  return useReactTable<AnnotationTask>({
    data,
    columns,
    columnResizeMode: "onChange",
    getCoreRowModel: getCoreRowModel(),
  });
}
