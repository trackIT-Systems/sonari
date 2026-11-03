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
  confidence: {
    confirmed: { count: 6, mean: 0.81, median: 0.84 },
    corrected: { count: 4, mean: 0.42, median: 0.4 },
    suggested_threshold: null,
  },
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
      confidence: {
        confirmed: { count: 6, mean: 0.81, median: 0.84 },
        corrected: { count: 4, mean: 0.42, median: 0.4 },
        suggested_threshold: 0.65,
      },
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

  it("compares the confidence of confirmed and corrected predictions", () => {
    render(<AnnotationProjectCorrectionsChart corrections={corrections} />);

    // Project-wide and per species
    expect(
      screen.getAllByText(/confirmed 0\.84 \(0\.81, n=6\) · corrected 0\.40 \(0\.42, n=4\)/),
    ).toHaveLength(2);
    // Only the species has enough predictions for a threshold
    expect(screen.getAllByText("≥90% confirmed from 0.65")).toHaveLength(1);
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
