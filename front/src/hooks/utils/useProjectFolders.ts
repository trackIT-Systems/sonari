import { useCallback, useEffect, useState } from "react";

import {
  DEFAULT_VIEW,
  moveProjects,
  parseFolders,
  parseView,
  type ProjectFolder,
  type ProjectListView,
} from "@/components/annotation_projects/projectListFilters";

const FOLDERS_KEY = "sonari:annotation-projects:folders";
const VIEW_KEY = "sonari:annotation-projects:view";

function load<T>(key: string, parse: (raw: unknown) => T, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : parse(JSON.parse(raw));
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: changes last for this visit only
  }
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Project folders and the chosen list filters, kept in this browser: they are
 * not shared with other users or devices.
 */
export default function useProjectFolders() {
  const [folders, setFolders] = useState<ProjectFolder[]>([]);
  const [view, setViewState] = useState<ProjectListView>(DEFAULT_VIEW);
  const [loaded, setLoaded] = useState(false);

  // Read after mount: the server render has no storage
  useEffect(() => {
    setFolders(load(FOLDERS_KEY, parseFolders, []));
    setViewState(load(VIEW_KEY, parseView, DEFAULT_VIEW));
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) save(FOLDERS_KEY, folders);
  }, [folders, loaded]);

  useEffect(() => {
    if (loaded) save(VIEW_KEY, view);
  }, [view, loaded]);

  // A view in a folder that is gone goes back to the top level
  useEffect(() => {
    if (!loaded || view.folder == null) return;
    if (!folders.some((f) => f.id === view.folder)) {
      setViewState((v) => ({ ...v, folder: null }));
    }
  }, [folders, view.folder, loaded]);

  const setView = useCallback((changes: Partial<ProjectListView>) => {
    setViewState((v) => ({ ...v, ...changes }));
  }, []);

  const createFolder = useCallback((name: string, projectIds: number[] = []) => {
    const folder: ProjectFolder = { id: newId(), name, projectIds: [] };
    setFolders((fs) => moveProjects([...fs, folder], projectIds, folder.id));
    return folder.id;
  }, []);

  const renameFolder = useCallback((folderId: string, name: string) => {
    setFolders((fs) => fs.map((f) => (f.id === folderId ? { ...f, name } : f)));
  }, []);

  /** Removes the folder; its projects become unfiled */
  const deleteFolder = useCallback((folderId: string) => {
    setFolders((fs) => fs.filter((f) => f.id !== folderId));
  }, []);

  const move = useCallback((projectIds: number[], folderId: string | null) => {
    setFolders((fs) => moveProjects(fs, projectIds, folderId));
  }, []);

  return {
    folders,
    view,
    setView,
    createFolder,
    renameFolder,
    deleteFolder,
    moveProjects: move,
  } as const;
}
