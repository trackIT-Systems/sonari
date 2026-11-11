import { useCallback } from "react";

import drawGeometry from "@/draw/geometry";
import { BLUE, GREEN, ORANGE, RED } from "@/draw/styles";
import { scaleGeometryToWindow } from "@/utils/geometry";

import type { SpectrogramWindow } from "@/types";
import type { TimelinePreview } from "@/utils/soundEventTimeline";

/** Colors of the edit history overlay, shared with the legend in the history panel. */
export const TIMELINE_COLORS = {
  unchanged: BLUE,
  changed: ORANGE,
  removedLater: RED,
  addedLater: GREEN,
};

const UNCHANGED = { borderColor: BLUE, fillColor: BLUE, borderWidth: 2, fillAlpha: 0.1 };
const CHANGED = { borderColor: ORANGE, fillColor: ORANGE, borderWidth: 2, fillAlpha: 0.15 };
const CHANGED_NOW = { borderColor: ORANGE, borderWidth: 1, borderAlpha: 0.7, borderDash: [4, 4], fillAlpha: 0 };
const REMOVED_LATER = { borderColor: RED, fillColor: RED, borderWidth: 2, borderDash: [6, 4], fillAlpha: 0.12 };
const ADDED_LATER = { borderColor: GREEN, borderWidth: 1.5, borderAlpha: 0.8, borderDash: [3, 3], fillAlpha: 0 };

/**
 * Draws the sound events of a past edit history step, marked by how they differ from now:
 * blue unchanged, orange changed later (dashed: the box now), red dashed deleted later,
 * green dashed outlines for events added later.
 */
export default function useTimelineDraw({
  window,
  preview,
}: {
  window: SpectrogramWindow;
  preview: TimelinePreview | null | undefined;
}) {
  return useCallback(
    (ctx: CanvasRenderingContext2D) => {
      if (preview == null) return;
      const draw = (geometry: Parameters<typeof scaleGeometryToWindow>[0], style: object) => {
        ctx.save();
        drawGeometry(ctx, scaleGeometryToWindow(geometry, window), style);
        ctx.restore();
      };

      for (const geometry of preview.addedLater) draw(geometry, ADDED_LATER);
      for (const event of preview.soundEventAnnotations) {
        const mark = preview.marks.get(event.id);
        if (mark?.status === "removed_later") {
          draw(event.geometry, REMOVED_LATER);
        } else if (mark?.status === "changed") {
          if (mark.geometryChanged) draw(mark.now, CHANGED_NOW);
          draw(event.geometry, CHANGED);
        } else {
          draw(event.geometry, UNCHANGED);
        }
      }
    },
    [window, preview],
  );
}
