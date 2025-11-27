import { useCallback, useEffect, useState } from "react";

import drawGeometry from "@/draw/geometry";
import { DEFAULT_LINESTRING_STYLE } from "@/draw/linestring";
import useWindowMotions from "@/hooks/window/useWindowMotions";
import { scaleGeometryToWindow } from "@/utils/geometry";

import type { BorderStyle } from "@/draw/styles";
import type {
  Coordinates,
  Dimensions,
  LineString,
  Position,
  SpectrogramWindow,
} from "@/types";

export default function useCreateLineString({
  window,
  enabled = true,
  style = DEFAULT_LINESTRING_STYLE,
  onCreate,
}: {
  window: SpectrogramWindow;
  enabled?: boolean;
  style?: BorderStyle;
  onCreate?: (lineString: LineString) => void;
}) {
  const [coordinates, setCoordinates] = useState<Coordinates[] | null>(null);
  const [vertex, setVertex] = useState<Position | null>(null);

  const clear = useCallback(() => {
    setCoordinates(null);
    setVertex(null);
  }, []);

  const handleMoveStart = useCallback(() => {
    // Remove the last vertex that was added at click since movement means
    // that the user wants to move the vertex
    setCoordinates((prev) => prev?.slice(0, -1) ?? null);
    setVertex(null);
  }, []);

  const handleMove = useCallback(
    ({ initial, shift }: { initial: Position; shift: Position }) => {
      setVertex({
        time: initial.time + shift.time,
        freq: initial.freq - shift.freq,
      });
    },
    [],
  );

  const handleAddVertex = useCallback(
    ({
      point,
    }: {
      point: Position;
    }) => {
      if (coordinates != null && coordinates.length >= 2) return;

      if (coordinates == null || coordinates.length < 2) {
        setCoordinates((prev) => {
          if (prev == null) return [[point.time, point.freq]];
          return [...prev, [point.time, point.freq]];
        });
        return;
      }

      // Otherwise create a linestring
      const newCoordinates =
        coordinates == null
          ? [[point.time, point.freq]]
          : [...coordinates, [point.time, point.freq]];
      onCreate?.({ type: "LineString", coordinates: newCoordinates });
      setCoordinates(null);
    },
    [coordinates, onCreate],
  );

  const handleClick = useCallback(
    ({
      position: point,
      shiftKey = false,
    }: {
      position: Position;
      shiftKey?: boolean;
    }) => {
      if (shiftKey) {
        clear();
        return;
      }

      if (coordinates != null && coordinates.length >= 2) {
        return;
      }
    
      handleAddVertex({ point });
    },
    [handleAddVertex, coordinates, clear],
  );

  const handleMoveEnd = useCallback(
    () => {
      if (vertex == null) return;
      handleAddVertex({ point: vertex });
      setVertex(null);
    },
    [vertex, handleAddVertex],
  );

  const { props, isDragging } = useWindowMotions({
    enabled,
    window,
    onClick: handleClick,
    onMoveStart: handleMoveStart,
    onMove: handleMove,
    onMoveEnd: handleMoveEnd,
  });

  // Create a drawing function for the bbox
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      if (!enabled) return;

      if (coordinates != null) {
        const geometry: LineString = { type: "LineString", coordinates };
        const scaled = scaleGeometryToWindow(geometry, window);
        drawGeometry(ctx, scaled, style);
        
        // Helper function to draw text with semi-transparent background
        const drawTextWithBackground = (
          text: string, 
          x: number, 
          y: number, 
          align: CanvasTextAlign = 'center',
          baseline: CanvasTextBaseline = 'middle'
        ) => {
          ctx.font = '12px sans-serif';
          ctx.textAlign = align;
          ctx.textBaseline = baseline;
          
          // Measure text for background
          const metrics = ctx.measureText(text);
          const padding = 4;
          let bgX: number;
          
          if (align === 'center') {
            bgX = x - metrics.width / 2 - padding;
          } else if (align === 'right') {
            bgX = x - metrics.width - padding;
          } else { // left
            bgX = x - padding;
          }
          
          let bgY: number;
          if (baseline === 'middle') {
            bgY = y - 8; // Approximate text height/2 + padding
          } else if (baseline === 'bottom') {
            bgY = y - 16;
          } else { // top
            bgY = y;
          }
          
          const bgWidth = metrics.width + padding * 2;
          const bgHeight = 16;
          
          // Draw semi-transparent background
          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          ctx.fillRect(bgX, bgY, bgWidth, bgHeight);
          
          // Draw border
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
          ctx.lineWidth = 1;
          ctx.strokeRect(bgX, bgY, bgWidth, bgHeight);
          
          // Draw text
          ctx.fillStyle = 'white';
          ctx.fillText(text, x, y);
        };

        // Draw crosshair markers at measurement points
        scaled.coordinates.forEach(([x, y]) => {
          const markerSize = 5;
          ctx.strokeStyle = 'white';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x - markerSize, y - markerSize);
          ctx.lineTo(x + markerSize, y + markerSize);
          ctx.moveTo(x + markerSize, y - markerSize);
          ctx.lineTo(x - markerSize, y + markerSize);
          ctx.stroke();
        });

        // For two-point measurements, show delta prominently
        if (scaled.coordinates.length === 2) {
          const [x1, y1] = scaled.coordinates[0];
          const [x2, y2] = scaled.coordinates[1];
          
          // Calculate deltas
          const originalCoord1 = coordinates[0];
          const originalCoord2 = coordinates[1];
          const deltaTime = Math.round(Math.abs(originalCoord2[0] - originalCoord1[0]) * 1000);
          const deltaFreq = Math.round(Math.abs((originalCoord2[1] - originalCoord1[1]) / 1000));
          
          // Position delta label prominently, offset from the line
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;
          
          // Offset perpendicular to the line direction
          const lineAngle = Math.atan2(y2 - y1, x2 - x1);
          const perpAngle = lineAngle + Math.PI / 2;
          const offsetDistance = 25; // Offset away from line
          
          const labelX = midX + Math.cos(perpAngle) * offsetDistance;
          const labelY = midY + Math.sin(perpAngle) * offsetDistance;
          
          // Draw delta label with background for better visibility
          const deltaText = `Δt: ${deltaTime}ms, Δf: ${deltaFreq}kHz`;
          ctx.font = '13px sans-serif';
          drawTextWithBackground(deltaText, labelX, labelY, 'center', 'middle');
          
          // Draw coordinate values at the edges if there's room
          const edgeDistance = Math.min(x1, ctx.canvas.width - x2, y1, ctx.canvas.height - y2);
          if (edgeDistance > 60) {
            const time1 = Math.round(originalCoord1[0] * 1000);
            const freq1 = Math.round(originalCoord1[1] / 1000);
            const time2 = Math.round(originalCoord2[0] * 1000);
            const freq2 = Math.round(originalCoord2[1] / 1000);
            
            // Draw start coordinate
            const text1 = `${time1}ms, ${freq1}kHz`;
            ctx.font = '11px sans-serif';
            drawTextWithBackground(text1, x1 - 60, y1 - 10, 'left', 'bottom');
            
            // Draw end coordinate
            const text2 = `${time2}ms, ${freq2}kHz`;
            drawTextWithBackground(text2, x2 + 10, y2 + 15, 'left', 'bottom');
          }
        }
      }

      if (vertex != null) {
        const scaledVertex = scaleGeometryToWindow(
          { type: "Point", coordinates: [vertex.time, vertex.freq] },
          window,
        );
        drawGeometry(ctx, scaledVertex, style);
        
        // Draw coordinates for the vertex being dragged
        const [x, y] = scaledVertex.coordinates;
        const timeValue = Math.round(vertex.time * 1000);
        const freqValue = Math.round(vertex.freq / 1000);
        const text = `${timeValue}ms, ${freqValue}kHz`;
        
        // Draw text with semi-transparent background
        ctx.font = '12px sans-serif';
        const metrics = ctx.measureText(text);
        const padding = 4;
        const bgX = x + 8 - padding;
        const bgY = y - 3 - 16; // y - 3 is baseline bottom, subtract text height
        const bgWidth = metrics.width + padding * 2;
        const bgHeight = 16;
        
        // Draw semi-transparent background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(bgX, bgY, bgWidth, bgHeight);
        
        // Draw border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(bgX, bgY, bgWidth, bgHeight);
        
        // Draw text
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = 'white';
        ctx.fillText(text, x + 8, y - 3);
      }

      if (coordinates != null && vertex != null && coordinates.length > 0) {
        const lastVertex = coordinates[coordinates.length - 1];
        const geometry: LineString = {
          type: "LineString",
          coordinates: [lastVertex, [vertex.time, vertex.freq]],
        };
        const scaled = scaleGeometryToWindow(geometry, window);
        drawGeometry(ctx, scaled, style);
      }
    },
    [enabled, coordinates, style, window, vertex],
  );

  useEffect(() => {
    if (!enabled && coordinates != null) setCoordinates(null);
  }, [enabled, coordinates]);

  return {
    props,
    isDragging,
    draw,
    clear,
  };
}
