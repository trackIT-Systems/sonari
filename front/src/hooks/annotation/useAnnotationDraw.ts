import { useCallback } from "react";

import drawGeometry from "@/draw/geometry";
import { BLUE } from "@/draw/styles";
import { scaleGeometryToWindow } from "@/utils/geometry";

import type { SoundEventAnnotation, SpectrogramWindow } from "@/types";

const IDLE_STYLE = {
  borderColor: BLUE,
  fillColor: BLUE,
  borderWidth: 2,
  fillAlpha: 0.1,
};

export default function useAnnotationDraw({
  window,
  annotations,
}: {
  window: SpectrogramWindow;
  annotations: SoundEventAnnotation[];
}) {
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      for (const item of annotations) {
        const geometry = scaleGeometryToWindow(
          // @ts-ignore
          item.geometry,
          window,
        );
        drawGeometry(ctx, geometry, IDLE_STYLE);
      }
    },
    [window, annotations],
  );

  return draw;
}
