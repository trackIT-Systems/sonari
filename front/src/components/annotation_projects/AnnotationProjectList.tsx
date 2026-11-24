import { useCallback, ReactElement, useState, useEffect, useMemo, useRef, type DragEvent } from "react";
import toast from "react-hot-toast";
import { useKeyPressEvent } from "react-use";
import useKeyFilter from "@/hooks/utils/useKeyFilter";
import { useRouter } from "next/navigation";
import classNames from "classnames";
import Loading from "@/app/loading";
import AnnotationProjectComponent from "@/components/annotation_projects/AnnotationProject";
import AnnotationProjectFilterBar from "@/components/annotation_projects/AnnotationProjectFilterBar";
import ProjectFolderGrid, {
  PROJECT_DRAG_TYPE,
  useProjectDrop,
} from "@/components/annotation_projects/ProjectFolderGrid";
import {
  filterProjects,
  folderByProject,
  projectsInFolder,
} from "@/components/annotation_projects/projectListFilters";
import Button from "@/components/Button";
import Empty from "@/components/Empty";
import {
  AddIcon,
  BackIcon,
  DatasetIcon,
  FolderOpenIcon,
  WarningIcon,
} from "@/components/icons";
import Search from "@/components/inputs/Search";
import StackedList from "@/components/lists/StackedList";
import { SELECT_CLASS } from "@/components/tags/management/TagsTab";
import useAnnotationProjects from "@/hooks/api/useAnnotationProjects";
import useProjectFolders from "@/hooks/utils/useProjectFolders";
import { LIST_OVERVIEW_DOWN_SHORTCUT, SEARCH_BAR_LEAVE_SHORTCUT } from "@/utils/keyboard";

import type { AnnotationProject } from "@/types";

/** Rows rendered at once; each row loads its progress */
const ROWS_PER_STEP = 100;

/** Every project is loaded, so the filters and folders work on the whole list */
const ALL_PROJECTS = 10000;

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function NoProjects() {
  return (
    <Empty>
      <WarningIcon className="w-16 h-16 text-stone-500" />
      <p>No annotation project exist yet!</p>
      <p>
        To create a new project, click on the
        <span className="text-emerald-500">
          <AddIcon className="inline-block mr-1 ml-2 w-4 h-4" />
          Create{" "}
        </span>{" "}
        button above.
      </p>
    </Empty>
  );
}

/** "All projects / <folder>": the first part goes back, and takes dropped projects out of the folder */
function FolderBreadcrumb({
  name,
  count,
  onBack,
  onDropOut,
}: {
  name: string;
  count: number;
  onBack: () => void;
  onDropOut: (projectIds: number[]) => void;
}) {
  const { over, dropProps } = useProjectDrop(onDropOut);
  return (
    <div className="flex flex-row flex-wrap items-center gap-2 text-sm">
      <button
        type="button"
        {...dropProps}
        onClick={onBack}
        className={classNames(
          "inline-flex items-center gap-1 rounded-md border border-transparent px-2 py-1 text-stone-500 hover:text-emerald-600",
          over && "border-emerald-500 bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20",
        )}
      >
        <BackIcon className="h-4 w-4" />
        All projects
      </button>
      <span className="text-stone-400">/</span>
      <span className="inline-flex items-center gap-1.5 font-semibold text-stone-900 dark:text-stone-100">
        <FolderOpenIcon className="h-5 w-5 text-emerald-500" />
        {name}
      </span>
      <span className="text-stone-500">{plural(count, "project")}</span>
    </div>
  );
}

export default function AnnotationProjectList({
  onCreate,
}: {
  onCreate?: (annotationProject: Promise<AnnotationProject>) => void;
}) {
  const { items: allItems, isLoading, filter } = useAnnotationProjects({ pageSize: ALL_PROJECTS });
  const {
    folders,
    view,
    setView,
    createFolder,
    renameFolder,
    deleteFolder,
    moveProjects,
  } = useProjectFolders();

  const openFolder = folders.find((f) => f.id === view.folder) ?? null;
  const searching = Boolean(filter.filter.search);
  const isFiltered = view.detector != null || view.year != null;

  const matching = useMemo(() => filterProjects(allItems, view), [allItems, view]);
  const byProject = useMemo(() => folderByProject(folders), [folders]);
  const folderName = useMemo(() => new Map(folders.map((f) => [f.id, f.name])), [folders]);

  const projectsByFolder = useMemo(() => {
    const map = new Map<string, AnnotationProject[]>();
    for (const project of matching) {
      const folderId = byProject.get(project.id);
      if (folderId == null) continue;
      map.set(folderId, [...(map.get(folderId) ?? []), project]);
    }
    return map;
  }, [matching, byProject]);

  // In a folder: its projects. At the top: the projects in no folder, or
  // every match while searching, so a search finds filed projects too.
  const items = useMemo(() => {
    if (openFolder != null) return projectsInFolder(matching, folders, openFolder.id);
    if (searching) return matching;
    return projectsInFolder(matching, folders, null);
  }, [matching, folders, openFolder, searching]);

  const [rowLimit, setRowLimit] = useState(ROWS_PER_STEP);
  const visibleItems = items.slice(0, rowLimit);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const selectedInFolder = Array.from(selected).some((id) => byProject.has(id));
  const allShownSelected = items.length > 0 && items.every((p) => selected.has(p.id));

  useEffect(() => {
    setRowLimit(ROWS_PER_STEP);
  }, [view, filter.filter]);

  useEffect(() => {
    setSelected(new Set());
  }, [view.folder]);

  const move = useCallback(
    (projectIds: number[], folderId: string | null) => {
      if (projectIds.length === 0) return;
      moveProjects(projectIds, folderId);
      setSelected(new Set());
      const where = folderId == null ? "out of their folder" : `to ${folderName.get(folderId)}`;
      toast.success(`Moved ${plural(projectIds.length, "project")} ${where}`);
    },
    [moveProjects, folderName],
  );

  const toggle = (projectId: number, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(projectId);
      else next.delete(projectId);
      return next;
    });

  const startDrag = (project: AnnotationProject) => (event: DragEvent) => {
    // Dragging a selected project takes the whole selection along
    const ids = selected.has(project.id) ? Array.from(selected) : [project.id];
    event.dataTransfer.setData(PROJECT_DRAG_TYPE, JSON.stringify(ids));
    event.dataTransfer.setData("text/plain", project.name);
    event.dataTransfer.effectAllowed = "move";
  };

  const router = useRouter();
  const [selectedAnnotationProject, setselectedAnnotationProject] = useState<AnnotationProject | null>(null);
  const [shouldNavigate, setShouldNavigate] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [focusedElement, setFocusedElement] = useState<'search' | number>(-1);

  useEffect(() => {
    if (shouldNavigate && selectedAnnotationProject) {
      router.push(`/annotation_projects/detail/?annotation_project_id=${selectedAnnotationProject.id}`);
      setShouldNavigate(false);
    }
  }, [shouldNavigate, selectedAnnotationProject, router, setShouldNavigate]);

  const handleSelect = useCallback(() => {
    setShouldNavigate(true);
  }, [setShouldNavigate]);

  const handleHighlight = useCallback((item: ReactElement) => {
    const project = (item as any).props.annotationProject;
    setselectedAnnotationProject(project);
  }, [setselectedAnnotationProject]);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === LIST_OVERVIEW_DOWN_SHORTCUT) {
      e.preventDefault();
      if (items.length > 0) {
        setFocusedElement(0);
        setselectedAnnotationProject(items[0]);
        searchInputRef.current?.blur();
      }
    }
  }, [items, setFocusedElement, setselectedAnnotationProject, searchInputRef]);

  useKeyPressEvent(useKeyFilter({ key: SEARCH_BAR_LEAVE_SHORTCUT }), (event) => {
    if (focusedElement === -1) {
      event.preventDefault();
      setFocusedElement('search');
      searchInputRef.current?.focus();
    }
  });

  const handleStackedListFocus = useCallback((index: number) => {
    if (index === -1) {
      setFocusedElement('search');
      searchInputRef.current?.focus();
    } else {
      setFocusedElement(index);
    }
  }, [searchInputRef, setFocusedElement]);

  const listHeading =
    openFolder != null
      ? null
      : searching
        ? `Search results · ${plural(items.length, "project")}`
        : folders.length > 0
          ? `Not in a folder · ${plural(items.length, "project")}`
          : plural(items.length, "project");

  const emptyMessage =
    openFolder != null
      ? isFiltered
        ? "No project in this folder matches the filters."
        : "This folder is empty. Go back, then drag projects onto it or select them and use Move to folder."
      : searching || isFiltered
        ? "No project matches."
        : "Every project is in a folder.";

  return (
    <div className="flex flex-col gap-4 p-8 w-full">
      <div className="flex flex-row flex-wrap items-center gap-3">
        <div className="min-w-[16rem] flex-grow">
          <Search
            label="Search"
            placeholder="Search project..."
            value={filter.get("search")}
            onChange={(value) => filter.set("search", value as string)}
            onSubmit={() => filter.submit()}
            icon={<DatasetIcon />}
            onKeyDown={handleSearchKeyDown}
            inputRef={searchInputRef as React.RefObject<HTMLInputElement>}
            isHighlighted={focusedElement === 'search'}
          />
        </div>
        <AnnotationProjectFilterBar projects={allItems} view={view} setView={setView} />
      </div>

      {isLoading ? (
        <Empty>
          <div className="p-8">
            <Loading />
          </div>
        </Empty>
      ) : allItems.length === 0 ? (
        <NoProjects />
      ) : (
        <>
          {openFolder == null ? (
            <ProjectFolderGrid
              folders={folders}
              projectsByFolder={projectsByFolder}
              selectedCount={selected.size}
              onOpen={(folderId) => setView({ folder: folderId })}
              onCreate={(name) => {
                const ids = Array.from(selected);
                createFolder(name, ids);
                setSelected(new Set());
                toast.success(
                  ids.length > 0
                    ? `Created ${name} with ${plural(ids.length, "project")}`
                    : `Created ${name}`,
                );
              }}
              onRename={renameFolder}
              onDelete={deleteFolder}
              onDrop={(folderId, ids) => move(ids, folderId)}
            />
          ) : (
            <FolderBreadcrumb
              name={openFolder.name}
              count={items.length}
              onBack={() => setView({ folder: null })}
              onDropOut={(ids) => move(ids, null)}
            />
          )}

          <div className="flex flex-row flex-wrap items-center gap-3 min-h-[2.5rem]">
            {selected.size > 0 ? (
              <div className="flex flex-grow flex-wrap items-center gap-3 rounded-md border border-emerald-500/40 bg-emerald-50 px-3 py-2 text-sm dark:bg-emerald-900/20">
                <span className="font-medium">{selected.size} selected</span>
                {folders.some((f) => f.id !== openFolder?.id) && (
                  <select
                    className={SELECT_CLASS}
                    aria-label="Move selected projects to a folder"
                    value=""
                    onChange={(event) => {
                      if (event.target.value) move(Array.from(selected), event.target.value);
                    }}
                  >
                    <option value="">Move to folder…</option>
                    {folders
                      .filter((f) => f.id !== openFolder?.id)
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                  </select>
                )}
                {selectedInFolder && (
                  <Button
                    mode="outline"
                    variant="secondary"
                    padding="px-3 py-1.5"
                    onClick={() => move(Array.from(selected), null)}
                  >
                    Remove from folder
                  </Button>
                )}
                {!allShownSelected && (
                  <Button
                    mode="text"
                    variant="secondary"
                    padding="px-2 py-1.5"
                    onClick={() => setSelected(new Set(items.map((p) => p.id)))}
                  >
                    Select all {items.length}
                  </Button>
                )}
                <Button
                  mode="text"
                  variant="secondary"
                  padding="px-2 py-1.5"
                  onClick={() => setSelected(new Set())}
                >
                  Clear selection
                </Button>
              </div>
            ) : (
              <>
                {listHeading && (
                  <h3 className="text-sm font-medium uppercase tracking-wide text-stone-500">
                    {listHeading}
                  </h3>
                )}
                {items.length > 0 && (
                  <span className="text-xs text-stone-400">
                    Tick projects or drag them onto a folder to file them.
                  </span>
                )}
              </>
            )}
          </div>

          {items.length === 0 ? (
            <p className="rounded-md border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500 dark:border-stone-600">
              {emptyMessage}
            </p>
          ) : (
            <StackedList
              items={visibleItems.map((item) => {
                return (
                  <AnnotationProjectComponent
                    key={item.id}
                    annotationProject={item}
                    selected={selected.has(item.id)}
                    onSelectChange={(on) => toggle(item.id, on)}
                    onDragStart={startDrag(item)}
                  />
                );
              })}
              onSelect={handleSelect}
              onHighlight={handleHighlight}
              onFocusChange={handleStackedListFocus}
              selectedIndex={typeof focusedElement === 'number' ? focusedElement : -1}
              handleNumberKeys={focusedElement !== 'search'}
            />
          )}
          {items.length > visibleItems.length && (
            <div className="flex justify-center">
              <Button mode="outline" variant="secondary" onClick={() => setRowLimit((n) => n + ROWS_PER_STEP)}>
                Show more ({items.length - visibleItems.length} left)
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
