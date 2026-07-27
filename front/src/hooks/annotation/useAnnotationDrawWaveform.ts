import { useCallback } from "react";

import { BLUE, GREEN, ORANGE } from "@/draw/styles";
import { scaleTimeToWindow } from "@/utils/geometry";

import type { SoundEventAnnotation, SpectrogramWindow } from "@/types";
import { SPECTROGRAM_CANVAS_DIMENSIONS } from "@/constants";

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
  borderDash: [6, 6],
  fillAlpha: 0.2,
};

const PASS_SIBLING_STYLE = {
  borderColor: ORANGE,
  fillColor: ORANGE,
  borderWidth: 2,
  borderDash: [4, 4],
  fillAlpha: 0.15,
};

type AnnotationDrawStyle = {
  borderColor: string;
  fillColor: string;
  borderWidth: number;
  fillAlpha: number;
  borderDash?: number[];
};

function getAnnotationTimeBounds(annotation: SoundEventAnnotation): [number, number] {
  const { geometry, geometry_type } = annotation;
  
  switch (geometry_type) {
    case "TimeInterval":
      const intervalCoords = geometry.coordinates as [number, number];
      return [intervalCoords[0], intervalCoords[1]];
      
    case "BoundingBox":
      const bboxCoords = geometry.coordinates as [number, number, number, number];
      return [bboxCoords[0], bboxCoords[2]];
      
    case "TimeStamp":
      const time = geometry.coordinates as number;
      return [time, time];
      
    case "Point":
      const pointCoords = geometry.coordinates as [number, number];
      return [pointCoords[0], pointCoords[0]];
      
    default:
      if (Array.isArray(geometry.coordinates)) {
        if (typeof geometry.coordinates[0] === 'number') {
          return [geometry.coordinates[0], geometry.coordinates[0]];
        }
        if (Array.isArray(geometry.coordinates[0])) {
          const times = (geometry.coordinates as number[][]).map(coord => coord[0]);
          return [Math.min(...times), Math.max(...times)];
        }
      }
      return [0, 0];
  }
}

function applyStyle(ctx: CanvasRenderingContext2D, style: AnnotationDrawStyle) {
  ctx.strokeStyle = style.borderColor;
  ctx.lineWidth = style.borderWidth;
  ctx.fillStyle = style.fillColor;
  ctx.globalAlpha = style.fillAlpha;

  if (style.borderDash) {
    ctx.setLineDash(style.borderDash);
  } else {
    ctx.setLineDash([]);
  }
}

function getAnnotationStyle(
  annotation: SoundEventAnnotation,
  selectedSoundEventAnnotation: SoundEventAnnotation | null | undefined,
  passSiblingIds: Set<number>,
): AnnotationDrawStyle {
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

export default function useAnnotationDrawWaveform({
  window,
  soundEventAnnotations,
  selectedSoundEventAnnotation,
  passSiblingIds = new Set<number>(),
}: {
  window: SpectrogramWindow;
  soundEventAnnotations: SoundEventAnnotation[];
  selectedSoundEventAnnotation?: SoundEventAnnotation | null;
  passSiblingIds?: Set<number>;
}) {
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      const drawOrder = [...soundEventAnnotations].sort((a, b) => {
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

      for (const soundEventAnnotation of drawOrder) {
        const [startTime, endTime] = getAnnotationTimeBounds(soundEventAnnotation);
        
        const startX = scaleTimeToWindow(startTime, window);
        const endX = scaleTimeToWindow(endTime, window);
        
        const style = getAnnotationStyle(
          soundEventAnnotation,
          selectedSoundEventAnnotation,
          passSiblingIds,
        );
        
        applyStyle(ctx, style);
        
        if (startTime === endTime) {
          ctx.beginPath();
          ctx.moveTo(startX, 0);
          ctx.lineTo(startX, SPECTROGRAM_CANVAS_DIMENSIONS.height);
          ctx.stroke();
        } else {
          const rectWidth = Math.max(endX - startX, 1);
          ctx.fillRect(startX, 0, rectWidth, SPECTROGRAM_CANVAS_DIMENSIONS.height);
          ctx.globalAlpha = 1;
          ctx.strokeRect(startX, 0, rectWidth, SPECTROGRAM_CANVAS_DIMENSIONS.height);
        }
      }
      
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    },
    [window, soundEventAnnotations, selectedSoundEventAnnotation, passSiblingIds],
  );

  return draw;
}
