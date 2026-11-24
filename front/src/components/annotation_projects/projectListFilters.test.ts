import { describe, expect, it } from "vitest";

import {
  countYears,
  DEFAULT_VIEW,
  filterProjects,
  moveProjects,
  parseFolders,
  parseView,
  projectDetector,
  projectsInFolder,
  type ProjectFolder,
} from "./projectListFilters";

const project = (id: number, name: string, year: number) => ({
  id,
  name,
  created_on: new Date(year, 5, 1),
});

const projects = [
  project(1, "default YOLOBat workshop-awst26-bat09", 2026),
  project(2, "birdedge Garden 2025", 2025),
  project(3, "yolobat river", 2025),
  project(4, "Manual survey", 2024),
];

const folders: ProjectFolder[] = [
  { id: "a", name: "Workshop", projectIds: [1, 2] },
  { id: "b", name: "Old", projectIds: [4] },
];

const ids = (ps: { id: number }[]) => ps.map((p) => p.id);

describe("projectDetector", () => {
  it("reads the detector from the name, ignoring case", () => {
    expect(projects.map(projectDetector)).toEqual(["yolobat", "birdedge", "yolobat", null]);
  });
});

describe("filterProjects", () => {
  it("shows every project by default", () => {
    expect(ids(filterProjects(projects, DEFAULT_VIEW))).toEqual([1, 2, 3, 4]);
  });

  it("combines detector and year", () => {
    expect(ids(filterProjects(projects, { detector: "yolobat", year: 2025 }))).toEqual([3]);
    expect(ids(filterProjects(projects, { detector: "birdedge", year: 2026 }))).toEqual([]);
  });

  it("leaves out the ignored criterion", () => {
    const view = { detector: "birdedge" as const, year: 2024 };
    expect(ids(filterProjects(projects, view, "year"))).toEqual([2]);
    expect(ids(filterProjects(projects, view, "detector"))).toEqual([4]);
  });
});

describe("projectsInFolder", () => {
  it("finds a folder's projects, or those in none", () => {
    expect(ids(projectsInFolder(projects, folders, "a"))).toEqual([1, 2]);
    expect(ids(projectsInFolder(projects, folders, null))).toEqual([3]);
  });
});

describe("countYears", () => {
  it("counts projects per year, newest first", () => {
    expect(countYears(projects)).toEqual([
      { year: 2026, count: 1 },
      { year: 2025, count: 2 },
      { year: 2024, count: 1 },
    ]);
  });
});

describe("moveProjects", () => {
  it("keeps each project in one folder", () => {
    const moved = moveProjects(folders, [2, 4], "b");
    expect(moved.map((f) => f.projectIds)).toEqual([[1], [2, 4]]);
  });

  it("takes projects out of every folder", () => {
    const moved = moveProjects(folders, [1, 4], null);
    expect(moved.map((f) => f.projectIds)).toEqual([[2], []]);
  });
});

describe("storage parsing", () => {
  it("drops malformed folders and ids", () => {
    expect(
      parseFolders([
        { id: "a", name: "A", projectIds: [1, "x", 2.5, 3] },
        { id: 1, name: "bad" },
        null,
      ]),
    ).toEqual([{ id: "a", name: "A", projectIds: [1, 3] }]);
    expect(parseFolders("nope")).toEqual([]);
  });

  it("falls back to defaults for unknown view values", () => {
    expect(parseView({ detector: "owl", year: "2025", folder: 3 })).toEqual(DEFAULT_VIEW);
    expect(parseView({ detector: "birdedge", year: 2025, folder: "a" })).toEqual({
      detector: "birdedge",
      year: 2025,
      folder: "a",
    });
  });
});
