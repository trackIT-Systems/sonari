import type { AnnotationProject } from "@/types";

/** Detector a project was made for, read from its name */
export type Detector = "yolobat" | "birdedge" | "anuravox";

export const DETECTORS: { id: Detector; label: string }[] = [
  { id: "yolobat", label: "yolobat" },
  { id: "birdedge", label: "birdedge" },
  { id: "anuravox", label: "anuravox" },
];

/** A folder of projects, kept in this browser only */
export type ProjectFolder = {
  id: string;
  name: string;
  projectIds: number[];
};

export type ProjectListView = {
  detector: Detector | null;
  year: number | null;
  /** The open folder; `null` shows the folders and the projects in none */
  folder: string | null;
};

export const DEFAULT_VIEW: ProjectListView = {
  detector: null,
  year: null,
  folder: null,
};

type ProjectLike = Pick<AnnotationProject, "id" | "name" | "created_on">;

export function projectDetector(project: Pick<ProjectLike, "name">): Detector | null {
  const name = project.name.toLowerCase();
  for (const { id } of DETECTORS) {
    if (name.includes(id)) return id;
  }
  return null;
}

export function projectYear(project: Pick<ProjectLike, "created_on">): number {
  return project.created_on.getFullYear();
}

/** The folder holding each project, by project id */
export function folderByProject(folders: ProjectFolder[]): Map<number, string> {
  const byProject = new Map<number, string>();
  for (const folder of folders) {
    for (const projectId of folder.projectIds) {
      if (!byProject.has(projectId)) byProject.set(projectId, folder.id);
    }
  }
  return byProject;
}

/**
 * The projects matching the detector and year. `ignore` leaves one criterion
 * out, to count what each choice of it would show given the other.
 */
export function filterProjects<T extends ProjectLike>(
  projects: T[],
  view: Pick<ProjectListView, "detector" | "year">,
  ignore?: "detector" | "year",
): T[] {
  return projects.filter((project) => {
    if (ignore !== "detector" && view.detector != null) {
      if (projectDetector(project) !== view.detector) return false;
    }
    if (ignore !== "year" && view.year != null) {
      if (projectYear(project) !== view.year) return false;
    }
    return true;
  });
}

/** The projects in a folder, or (`null`) in no folder */
export function projectsInFolder<T extends ProjectLike>(
  projects: T[],
  folders: ProjectFolder[],
  folderId: string | null,
): T[] {
  const byProject = folderByProject(folders);
  return projects.filter((project) => (byProject.get(project.id) ?? null) === folderId);
}

/** Years the projects were created in, newest first, with how many projects each */
export function countYears(projects: ProjectLike[]): { year: number; count: number }[] {
  const counts = new Map<number, number>();
  for (const project of projects) {
    const year = projectYear(project);
    counts.set(year, (counts.get(year) ?? 0) + 1);
  }
  return Array.from(counts, ([year, count]) => ({ year, count })).sort(
    (a, b) => b.year - a.year,
  );
}

/** Puts projects into a folder (`null`: into no folder), taking them out of any other */
export function moveProjects(
  folders: ProjectFolder[],
  projectIds: number[],
  folderId: string | null,
): ProjectFolder[] {
  const moving = new Set(projectIds);
  return folders.map((folder) => {
    const kept = folder.projectIds.filter((id) => !moving.has(id));
    if (folder.id !== folderId) return { ...folder, projectIds: kept };
    return { ...folder, projectIds: [...kept, ...projectIds] };
  });
}

/** Folders read back from storage; anything malformed is dropped */
export function parseFolders(raw: unknown): ProjectFolder[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (item == null || typeof item !== "object") return [];
    const { id, name, projectIds } = item as Record<string, unknown>;
    if (typeof id !== "string" || typeof name !== "string" || !Array.isArray(projectIds)) {
      return [];
    }
    return [
      {
        id,
        name,
        projectIds: projectIds.filter((p): p is number => Number.isInteger(p)),
      },
    ];
  });
}

/** A view read back from storage; unknown values fall back to the default */
export function parseView(raw: unknown): ProjectListView {
  if (raw == null || typeof raw !== "object") return DEFAULT_VIEW;
  const { detector, year, folder } = raw as Record<string, unknown>;
  return {
    detector: DETECTORS.some((d) => d.id === detector) ? (detector as Detector) : null,
    year: Number.isInteger(year) ? (year as number) : null,
    folder: typeof folder === "string" ? folder : null,
  };
}
