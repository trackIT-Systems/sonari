import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { PredictionCorrectionStats } from "@/api/annotation_projects";

import AnnotationProjectCorrectionsChart from "./AnnotationProjectCorrectionsChart";

const corrections: PredictionCorrectionStats = {
  detector: "yolobat11",
  run_id: 3,
  model_versions: ["2026.4.1"],
  reviewed_tasks: 4,
  recordings: 4,
  recordings_with_source: 3,
  match_rate: 1,
  reliable: true,
  species: [
    {
      key: "species",
      value: "Myotis daubentonii",
      predicted: 10,
      confirmed: 6,
      relabeled: 3,
      tag_removed: 0,
      event_deleted: 1,
      box_changed: 2,
      relabeled_to: [{ key: "species", value: "Myotis bechsteinii", count: 3 }],
    },
  ],
  added: [{ key: "species", value: "Eptesicus serotinus", count: 2 }],
};

describe("AnnotationProjectCorrectionsChart", () => {
  afterEach(cleanup);

  it("shows outcomes, relabel targets and added tags", () => {
    render(<AnnotationProjectCorrectionsChart corrections={corrections} />);

    expect(screen.getByText("Myotis daubentonii")).toBeTruthy();
    expect(screen.getByText("6/10 confirmed")).toBeTruthy();
    expect(screen.getByText("→ Myotis bechsteinii 3 · 2 boxes adjusted")).toBeTruthy();
    expect(screen.getByTitle("Event deleted: 1")).toBeTruthy();
    expect(screen.getByText("Eptesicus serotinus")).toBeTruthy();
    expect(screen.getByText(/GUANO detections for 3 of 4 recordings/)).toBeTruthy();
    expect(screen.queryByText(/Treat these numbers with caution/)).toBeNull();
  });

  it("warns when the GUANO files do not match the project", () => {
    render(
      <AnnotationProjectCorrectionsChart
        corrections={{ ...corrections, match_rate: 0.4, reliable: false }}
      />,
    );
    expect(screen.getByText(/Only 40% of the detector/)).toBeTruthy();
  });

  it("explains when nothing is reviewed yet", () => {
    render(
      <AnnotationProjectCorrectionsChart
        corrections={{ ...corrections, reviewed_tasks: 0, species: [], added: [] }}
      />,
    );
    expect(screen.getByText(/No tasks are completed or verified yet/)).toBeTruthy();
  });
});
