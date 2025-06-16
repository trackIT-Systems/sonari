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
        
        // Helper function to draw text with outline for better visibility
        const drawOutlinedText = (text: string, x: number, y: number) => {
          ctx.font = '12px sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'bottom';
          
          // Draw black outline
          ctx.strokeStyle = 'black';
          ctx.lineWidth = 3;
          ctx.strokeText(text, x, y);
          
          // Draw white text on top
          ctx.fillStyle = 'white';
          ctx.fillText(text, x, y);
        };

        // Collect all text positions to check for overlaps with simpler positioning
        const textPositions: { x: number; y: number; text: string; index: number }[] = [];
        
        scaled.coordinates.forEach((coord, index) => {
          const [x, y] = coord;
          const markerSize = 5; 
          
          // Draw crosshair marker
          ctx.strokeStyle = 'white';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x - markerSize, y - markerSize);
          ctx.lineTo(x + markerSize, y + markerSize);
          ctx.moveTo(x + markerSize, y - markerSize);
          ctx.lineTo(x - markerSize, y + markerSize);
          ctx.stroke();
          
          // Prepare text
          const originalCoord = coordinates[index];
          const timeValue = Math.round(originalCoord[0] * 1000);
          const freqValue = Math.round(originalCoord[1] / 1000);
          const text = `${timeValue}ms, ${freqValue}kHz`;
          
          // Simple positioning: try to place text away from the line
          let textX = x + 8;
          let textY = y - 3;
          
          // If we have a line, adjust position to avoid overlap
          if (scaled.coordinates.length > 1) {
            if (index > 0) {
              // Check if line goes right or left, up or down
              const [prevX, prevY] = scaled.coordinates[index - 1];
              const lineGoesRight = x > prevX;
              const lineGoesUp = y < prevY;
              
              // Position text on the opposite side of where the line comes from
              if (lineGoesRight && lineGoesUp) {
                textX = x + 8; textY = y + 8; // Bottom right
              } else if (lineGoesRight && !lineGoesUp) {
                textX = x + 8; textY = y - 3; // Top right  
              } else if (!lineGoesRight && lineGoesUp) {
                textX = x - 3; textY = y + 8; // Bottom left
              } else {
                textX = x - 3; textY = y - 3; // Top left
              }
            } else if (index < scaled.coordinates.length - 1) {
              // For first point, check where next point is
              const [nextX, nextY] = scaled.coordinates[index + 1];
              const lineGoesRight = nextX > x;
              const lineGoesUp = nextY < y;
              
              // Position text on opposite side of where line goes
              if (lineGoesRight && lineGoesUp) {
                textX = x - 3; textY = y + 8; // Bottom left
              } else if (lineGoesRight && !lineGoesUp) {
                textX = x - 3; textY = y - 3; // Top left
              } else if (!lineGoesRight && lineGoesUp) {
                textX = x + 8; textY = y + 8; // Bottom right
              } else {
                textX = x + 8; textY = y - 3; // Top right
              }
            }
          }
          
          textPositions.push({ x: textX, y: textY, text, index });
        });

        // Simple overlap resolution: just move overlapping text vertically
        for (let i = 0; i < textPositions.length; i++) {
          for (let j = i + 1; j < textPositions.length; j++) {
            const pos1 = textPositions[i];
            const pos2 = textPositions[j];
            
            const dx = Math.abs(pos1.x - pos2.x);
            const dy = Math.abs(pos1.y - pos2.y);
            
            if (dx < 120 && dy < 20) {
              // Move second text down
              pos2.y += 8;
            }
          }
        }

        // Draw all coordinate texts
        textPositions.forEach(({ x, y, text }) => {
          drawOutlinedText(text, x, y);
        });

        // Draw delta labels between points with simpler positioning
        if (scaled.coordinates.length > 1) {
          scaled.coordinates.forEach((coord, index) => {
            if (index > 0) {
              const [x, y] = coord;
              const [prevX, prevY] = scaled.coordinates[index - 1];
              const originalCoord = coordinates[index];
              const prevCoord = coordinates[index - 1];
              
              const deltaTime = Math.round(Math.abs(originalCoord[0] - prevCoord[0]) * 1000);
              const deltaFreq = Math.round(Math.abs((originalCoord[1] - prevCoord[1]) / 1000));
              
              // Simple midpoint positioning with small offset
              const midX = (prevX + x) / 2;
              const midY = (prevY + y) / 2 - 3; // Just offset up a bit
              
              const deltaText = `Δt: ${deltaTime}ms, Δf: ${deltaFreq}kHz`;
              drawOutlinedText(deltaText, midX, midY);
            }
          });
        }
      }

      if (vertex != null) {
        const scaledVertex = scaleGeometryToViewport(
          dimensions,
          { type: "Point", coordinates: [vertex.time, vertex.freq] },
          viewport,
        );
        drawGeometry(ctx, scaledVertex, style);
        
        // Draw coordinates for the vertex being dragged
        const [x, y] = scaledVertex.coordinates;
        const timeValue = Math.round(vertex.time * 1000);
        const freqValue = Math.round(vertex.freq / 1000);
        const text = `${timeValue}ms, ${freqValue}kHz`;
        
        // Helper function for outlined text (redefined here for vertex)
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        
        // Draw black outline
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 3;
        ctx.strokeText(text, x + 8, y - 3);
        
        // Draw white text on top
        ctx.fillStyle = 'white';
        ctx.fillText(text, x + 8, y - 3);
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
