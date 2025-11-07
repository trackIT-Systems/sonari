import { useCallback } from "react";

import { BLUE, ORANGE, GREEN, RED } from "@/draw/styles";
import { scaleTimeToViewport } from "@/utils/geometry";

import type { SoundEventAnnotation, SpectrogramWindow } from "@/types";

// Same styles as spectrogram but adapted for waveform
const IDLE_STYLE = {
  borderColor: BLUE,
  fillColor: BLUE,
  borderWidth: 2,
  fillAlpha: 0.1,
};

const EDIT_STYLE = {
  borderColor: GREEN,
  fillColor: GREEN,
  borderWidth: 2,
  borderDash: [6, 6],
  fillAlpha: 0.2,
};

// Extract time bounds from annotation geometry
function getAnnotationTimeBounds(annotation: SoundEventAnnotation): [number, number] {
  const { geometry, geometry_type } = annotation;
  
  switch (geometry_type) {
    case "TimeInterval":
      const intervalCoords = geometry.coordinates as [number, number];
      return [intervalCoords[0], intervalCoords[1]];
      
    case "BoundingBox":
      const bboxCoords = geometry.coordinates as [number, number, number, number];
      return [bboxCoords[0], bboxCoords[2]]; // [startTime, endTime]
      
    case "TimeStamp":
      const time = geometry.coordinates as number;
      return [time, time]; // Single point in time
      
    case "Point":
      const pointCoords = geometry.coordinates as [number, number];
      return [pointCoords[0], pointCoords[0]]; // Just the time component
      
    default:
      // For other geometry types, try to extract time bounds
      if (Array.isArray(geometry.coordinates)) {
        if (typeof geometry.coordinates[0] === 'number') {
          return [geometry.coordinates[0], geometry.coordinates[0]];
        }
        if (Array.isArray(geometry.coordinates[0])) {
          // For LineString, MultiPoint, etc., get min/max time
          const times = (geometry.coordinates as number[][]).map(coord => coord[0]);
          return [Math.min(...times), Math.max(...times)];
        }
      }
      return [0, 0];
  }
}

// Apply border and fill styles to canvas context
function applyStyle(ctx: CanvasRenderingContext2D, style: any) {
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

export default function useAnnotationDrawWaveform({
  viewport,
  soundEventAnnotations,
  selectedSoundEventAnnotation,
}: {
  viewport: SpectrogramWindow;
  soundEventAnnotations: SoundEventAnnotation[];
  selectedSoundEventAnnotation?: SoundEventAnnotation | null;
}) {
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      const { width, height } = ctx.canvas;
      
      for (const soundEventAnnotation of soundEventAnnotations) {
        const [startTime, endTime] = getAnnotationTimeBounds(soundEventAnnotation);
        
        // Convert time bounds to x coordinates
        const startX = scaleTimeToViewport(startTime, viewport, width);
        const endX = scaleTimeToViewport(endTime, viewport, width);
        
        // Determine style based on annotation state and mode
        let style = IDLE_STYLE;
        
        if (selectedSoundEventAnnotation && selectedSoundEventAnnotation.id === soundEventAnnotation.id) {
          style = EDIT_STYLE;
        }
        
        // Apply the style
        applyStyle(ctx, style);
        
        // Draw the annotation bounds on waveform
        if (startTime === endTime) {
          // Point in time - draw a vertical line
          ctx.beginPath();
          ctx.moveTo(startX, 0);
          ctx.lineTo(startX, height);
          ctx.stroke();
        } else {
          // Time interval - draw a rectangle spanning the full height
          const rectWidth = Math.max(endX - startX, 1); // Minimum 1px width
          
          // Fill the rectangle
          ctx.fillRect(startX, 0, rectWidth, height);
          
          // Draw border
          ctx.globalAlpha = 1; // Full opacity for border
          ctx.strokeRect(startX, 0, rectWidth, height);
        }
      }
      
      // Reset canvas state
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    },
    [viewport, soundEventAnnotations, selectedSoundEventAnnotation],
  );

  return draw;
} 