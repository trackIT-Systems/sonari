import classNames from "classnames";
import { type DragEvent, useState } from "react";

import Button from "@/components/Button";
import Card from "@/components/Card";
import { AddIcon, DeleteIcon, EditIcon, FolderIcon } from "@/components/icons";
import { Input } from "@/components/inputs";

import { DETECTORS, projectDetector, type ProjectFolder } from "./projectListFilters";

import type { AnnotationProject } from "@/types";

/** Drag payload: the ids of the projects being dragged */
export const PROJECT_DRAG_TYPE = "application/x-sonari-projects";

export function readDraggedProjects(event: DragEvent): number[] | null {
  const raw = event.dataTransfer.getData(PROJECT_DRAG_TYPE);
  if (!raw) return null;
  try {
    const ids = JSON.parse(raw);
    return Array.isArray(ids) ? ids.filter((id) => Number.isInteger(id)) : null;
  } catch {
    return null;
  }
}

/** Props that make an element accept dropped projects, highlighting it meanwhile */
export function useProjectDrop(onDrop: (projectIds: number[]) => void) {
  const [over, setOver] = useState(false);
  const accepts = (event: DragEvent) => event.dataTransfer.types.includes(PROJECT_DRAG_TYPE);
  return {
    over,
    dropProps: {
      onDragOver: (event: DragEvent) => {
        if (!accepts(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (event: DragEvent) => {
        setOver(false);
        const ids = readDraggedProjects(event);
        if (ids == null) return;
        event.preventDefault();
        onDrop(ids);
      },
    },
  } as const;
}

function NameForm({
  initial = "",
  submitLabel,
  hint,
  onSubmit,
  onCancel,
}: {
  initial?: string;
  submitLabel: string;
  hint?: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) onSubmit(name.trim());
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Folder name</span>
        <Input
          autoFocus
          value={name}
          placeholder="e.g. Workshop 2026"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onCancel();
          }}
        />
        {hint && <span className="text-xs text-stone-500">{hint}</span>}
      </label>
      <div className="flex justify-end gap-2">
        <Button mode="text" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!name.trim()}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function FolderCard({
  folder,
  projects,
  onOpen,
  onRename,
  onDelete,
  onDrop,
}: {
  folder: ProjectFolder;
  /** The folder's projects that match the filters */
  projects: AnnotationProject[];
  onOpen: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onDrop: (projectIds: number[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const { over, dropProps } = useProjectDrop(onDrop);

  if (editing) {
    return (
      <Card>
        <NameForm
          initial={folder.name}
          submitLabel="Save"
          onCancel={() => setEditing(false)}
          onSubmit={(name) => {
            onRename(name);
            setEditing(false);
          }}
        />
      </Card>
    );
  }

  const detectorCounts = DETECTORS.map((d) => ({
    ...d,
    count: projects.filter((p) => projectDetector(p) === d.id).length,
  })).filter((d) => d.count > 0);

  return (
    <Card
      {...dropProps}
      className={classNames(
        "cursor-pointer transition-colors hover:border-emerald-500",
        over && "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20",
        projects.length === 0 && !over && "opacity-60",
      )}
      onClick={onOpen}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <FolderIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
          <div className="min-w-0">
            <div className="truncate font-semibold text-stone-900 dark:text-stone-100">
              {folder.name}
            </div>
            <div className="text-sm text-stone-500">
              {projects.length} project{projects.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>
        <div className="flex gap-1" onClick={(event) => event.stopPropagation()}>
          <Button
            mode="text"
            variant="secondary"
            padding="p-1"
            aria-label={`Rename ${folder.name}`}
            onClick={() => setEditing(true)}
          >
            <EditIcon className="h-5 w-5" />
          </Button>
          <Button
            mode="text"
            variant="danger"
            padding="p-1"
            aria-label={`Delete ${folder.name}`}
            onClick={() => {
              if (
                window.confirm(
                  `Delete the folder "${folder.name}"? Its projects are kept and go back to the top level.`,
                )
              )
                onDelete();
            }}
          >
            <DeleteIcon className="h-5 w-5" />
          </Button>
        </div>
      </div>
      {detectorCounts.length > 0 && (
        <div className="flex flex-wrap gap-1 text-xs">
          {detectorCounts.map((d) => (
            <span key={d.id} className="rounded bg-stone-200 px-1.5 py-0.5 dark:bg-stone-700">
              {d.label} {d.count}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function ProjectFolderGrid({
  folders,
  projectsByFolder,
  selectedCount,
  onOpen,
  onCreate,
  onRename,
  onDelete,
  onDrop,
}: {
  folders: ProjectFolder[];
  /** Each folder's projects that match the filters */
  projectsByFolder: Map<string, AnnotationProject[]>;
  /** Projects selected in the list; a new folder takes them in */
  selectedCount: number;
  onOpen: (folderId: string) => void;
  onCreate: (name: string) => void;
  onRename: (folderId: string, name: string) => void;
  onDelete: (folderId: string) => void;
  onDrop: (folderId: string, projectIds: number[]) => void;
}) {
  const [creating, setCreating] = useState(false);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {folders.map((folder) => (
        <FolderCard
          key={folder.id}
          folder={folder}
          projects={projectsByFolder.get(folder.id) ?? []}
          onOpen={() => onOpen(folder.id)}
          onRename={(name) => onRename(folder.id, name)}
          onDelete={() => onDelete(folder.id)}
          onDrop={(ids) => onDrop(folder.id, ids)}
        />
      ))}
      {creating ? (
        <Card>
          <NameForm
            submitLabel="Create folder"
            hint={
              selectedCount > 0
                ? `The ${selectedCount} selected project${selectedCount === 1 ? "" : "s"} move into it.`
                : "Drag projects onto the folder, or select them and use Move to folder."
            }
            onCancel={() => setCreating(false)}
            onSubmit={(name) => {
              onCreate(name);
              setCreating(false);
            }}
          />
        </Card>
      ) : (
        <button
          type="button"
          className="flex min-h-[5.5rem] items-center justify-center gap-2 rounded-md border border-dashed border-stone-300 text-stone-500 hover:border-emerald-500 hover:text-emerald-600 dark:border-stone-600"
          onClick={() => setCreating(true)}
        >
          <AddIcon className="h-5 w-5" />
          {selectedCount > 0 ? `New folder with ${selectedCount} selected` : "New folder"}
        </button>
      )}
    </div>
  );
}
