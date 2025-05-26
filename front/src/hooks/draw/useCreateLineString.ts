import { useCallback, useEffect, useState } from "react";

import drawGeometry from "@/draw/geometry";
import { DEFAULT_LINESTRING_STYLE } from "@/draw/linestring";
import useWindowMotions from "@/hooks/window/useWindowMotions";
import { scaleGeometryToViewport } from "@/utils/geometry";

import type { BorderStyle } from "@/draw/styles";
import type {
  Coordinates,
  Dimensions,
  LineString,
  Position,
  SpectrogramWindow,
} from "@/types";

export default function useCreateLineString({
  viewport,
  dimensions,
  enabled = true,
  style = DEFAULT_LINESTRING_STYLE,
  onCreate,
}: {
  viewport: SpectrogramWindow;
  dimensions: Dimensions;
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
    viewport,
    dimensions,
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
        const scaled = scaleGeometryToViewport(dimensions, geometry, viewport);
        drawGeometry(ctx, scaled, style);
        
        scaled.coordinates.forEach((coord, index) => {
          const [x, y] = coord;
          const markerSize = 5; 
          
          ctx.strokeStyle = 'white';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x - markerSize, y - markerSize);
          ctx.lineTo(x + markerSize, y + markerSize);
          ctx.moveTo(x + markerSize, y - markerSize);
          ctx.lineTo(x - markerSize, y + markerSize);
          ctx.stroke();
          
          const originalCoord = coordinates[index];
          ctx.font = '12px sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'bottom';
          // Round to 2 decimal places for cleaner display
          const timeValue = originalCoord[0].toFixed(2);
          const freqValue = (originalCoord[1] / 1000).toFixed(2);
          ctx.fillText(`${timeValue}s, ${freqValue}kHz`, x + 8, y - 3);
          
          // Draw delta between current and previous vertex
          if (index > 0) {
            const prevCoord = coordinates[index - 1];
            const deltaTime = Math.abs(originalCoord[0] - prevCoord[0]).toFixed(2);
            const deltaFreq = Math.abs((originalCoord[1] - prevCoord[1]) / 1000).toFixed(2);
            
            // Calculate midpoint for delta label
            const midX = (scaled.coordinates[index-1][0] + x) / 2;
            const midY = (scaled.coordinates[index-1][1] + y) / 2;
            
            // Show delta with a different color
            ctx.fillText(`Δt: ${deltaTime}s, Δf: ${deltaFreq}kHz`, midX, midY - 5);
          }
        });
      }

      if (vertex != null) {
        const scaledVertex = scaleGeometryToViewport(
          dimensions,
          { type: "Point", coordinates: [vertex.time, vertex.freq] },
          viewport,
        );
        drawGeometry(ctx, scaledVertex, style);
      }

      if (coordinates != null && vertex != null && coordinates.length > 0) {
        const lastVertex = coordinates[coordinates.length - 1];
        const geometry: LineString = {
          type: "LineString",
          coordinates: [lastVertex, [vertex.time, vertex.freq]],
        };
        const scaled = scaleGeometryToViewport(dimensions, geometry, viewport);
        drawGeometry(ctx, scaled, style);
      }
    },
    [enabled, coordinates, style, viewport, dimensions, vertex],
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
