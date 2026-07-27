import { useCallback } from "react";

import drawGeometry from "@/draw/geometry";
import { BLUE, GREEN, ORANGE } from "@/draw/styles";
import { scaleGeometryToWindow, scaleTimeToWindow } from "@/utils/geometry";
import { getPassContext, getPassTimeRange } from "@/utils/passes";

import type { SoundEventAnnotation, SpectrogramWindow } from "@/types";

const IDLE_STYLE = {
  borderColor: BLUE,
  fillColor: BLUE,
  borderWidth: 2,
  fillAlpha: 0.1,
};

const SELECTED_STYLE = {
  borderColor: GREEN,
  fillColor: GREEN,
  borderWidth: 2,
  fillAlpha: 0.2,
};

const PASS_SIBLING_STYLE = {
  borderColor: ORANGE,
  fillColor: ORANGE,
  borderWidth: 2,
  fillAlpha: 0.15,
};

function getAnnotationStyle(
  annotation: SoundEventAnnotation,
  selectedSoundEventAnnotation: SoundEventAnnotation | null | undefined,
  passSiblingIds: Set<number>,
) {
  if (
    selectedSoundEventAnnotation &&
    selectedSoundEventAnnotation.id === annotation.id
  ) {
    return SELECTED_STYLE;
  }

  if (passSiblingIds.has(annotation.id)) {
    return PASS_SIBLING_STYLE;
  }

  return IDLE_STYLE;
}

export default function useAnnotationDraw({
  window,
  annotations,
  selectedSoundEventAnnotation,
  passSiblingIds = new Set<number>(),
}: {
  window: SpectrogramWindow;
  annotations: SoundEventAnnotation[];
  selectedSoundEventAnnotation?: SoundEventAnnotation | null;
  passSiblingIds?: Set<number>;
}) {
  const passBracket = selectedSoundEventAnnotation
    ? getPassContext(selectedSoundEventAnnotation, annotations)
    : null;

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      if (passBracket) {
        const range = getPassTimeRange(passBracket.events);
        if (range) {
          const startX = scaleTimeToWindow(range.start, window);
          const endX = scaleTimeToWindow(range.end, window);
          const y = 4;

          ctx.save();
          ctx.strokeStyle = ORANGE;
          ctx.lineWidth = 1;
          ctx.globalAlpha = 0.6;
          ctx.beginPath();
          ctx.moveTo(startX, y);
          ctx.lineTo(endX, y);
          ctx.stroke();
          ctx.restore();
        }
      }

      const drawOrder = [...annotations].sort((a, b) => {
        const rank = (annotation: SoundEventAnnotation) => {
          if (selectedSoundEventAnnotation?.id === annotation.id) {
            return 2;
          }
          if (passSiblingIds.has(annotation.id)) {
            return 1;
          }
          return 0;
        };
        return rank(a) - rank(b);
      });

      for (const item of drawOrder) {
        const geometry = scaleGeometryToWindow(
          // @ts-ignore
          item.geometry,
          window,
        );
        drawGeometry(
          ctx,
          geometry,
          getAnnotationStyle(
            item,
            selectedSoundEventAnnotation,
            passSiblingIds,
          ),
        );
      }
    },
    [
      window,
      annotations,
      selectedSoundEventAnnotation,
      passSiblingIds,
      passBracket,
    ],
  );

  return draw;
}
