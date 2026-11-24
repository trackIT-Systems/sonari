import { SELECT_CLASS } from "@/components/tags/management/TagsTab";

import {
  countYears,
  DETECTORS,
  filterProjects,
  projectDetector,
  type Detector,
  type ProjectListView,
} from "./projectListFilters";

import type { AnnotationProject } from "@/types";

/** Detector and year pickers; each option counts what it would show */
export default function AnnotationProjectFilterBar({
  projects,
  view,
  setView,
}: {
  /** Every project the search matches */
  projects: AnnotationProject[];
  view: ProjectListView;
  setView: (changes: Partial<ProjectListView>) => void;
}) {
  const forDetector = filterProjects(projects, view, "detector");
  const years = countYears(filterProjects(projects, view, "year"));
  const isFiltered = view.detector != null || view.year != null;

  return (
    <>
      <select
        className={SELECT_CLASS}
        aria-label="Filter by detector"
        value={view.detector ?? ""}
        onChange={(event) =>
          setView({ detector: (event.target.value || null) as Detector | null })
        }
      >
        <option value="">All detectors ({forDetector.length})</option>
        {DETECTORS.map((d) => (
          <option key={d.id} value={d.id}>
            {d.label} ({forDetector.filter((p) => projectDetector(p) === d.id).length})
          </option>
        ))}
      </select>
      <select
        className={SELECT_CLASS}
        aria-label="Filter by creation year"
        value={view.year ?? ""}
        onChange={(event) =>
          setView({ year: event.target.value ? Number(event.target.value) : null })
        }
      >
        <option value="">All years</option>
        {years.map(({ year, count }) => (
          <option key={year} value={year}>
            {year} ({count})
          </option>
        ))}
        {view.year != null && !years.some((y) => y.year === view.year) && (
          <option value={view.year}>{view.year} (0)</option>
        )}
      </select>
      {isFiltered && (
        <button
          type="button"
          className="text-sm text-emerald-600 hover:underline dark:text-emerald-400"
          onClick={() => setView({ detector: null, year: null })}
        >
          Clear filters
        </button>
      )}
    </>
  );
}
