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

        // Calculate distance between points to determine if this is a "small" measurement
        const isSmallMeasurement = scaled.coordinates.length === 2 && 
          Math.hypot(
            scaled.coordinates[1][0] - scaled.coordinates[0][0],
            scaled.coordinates[1][1] - scaled.coordinates[0][1]
          ) < 100; // Less than 100 pixels

        if (isSmallMeasurement) {
          // Special layout for small measurements: show only delta prominently
          const [x1, y1] = scaled.coordinates[0];
          const [x2, y2] = scaled.coordinates[1];
          
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
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          // Measure text for background
          const metrics = ctx.measureText(deltaText);
          const padding = 4;
          const bgX = labelX - metrics.width / 2 - padding;
          const bgY = labelY - 8; // Approximate text height/2 + padding
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
          ctx.fillText(deltaText, labelX, labelY);
          
          // Optionally, draw coordinate values at the edges if there's room
          const edgeDistance = Math.min(x1, ctx.canvas.width - x2, y1, ctx.canvas.height - y2);
          if (edgeDistance > 60) {
            ctx.font = '11px sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'bottom';
            
            const time1 = Math.round(originalCoord1[0] * 1000);
            const freq1 = Math.round(originalCoord1[1] / 1000);
            const time2 = Math.round(originalCoord2[0] * 1000);
            const freq2 = Math.round(originalCoord2[1] / 1000);
            
            // Draw start coordinate above/left of line
            const text1 = `${time1}ms, ${freq1}kHz`;
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 2;
            ctx.strokeText(text1, x1 - 60, y1 - 10);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.fillText(text1, x1 - 60, y1 - 10);
            
            // Draw end coordinate below/right of line  
            const text2 = `${time2}ms, ${freq2}kHz`;
            ctx.strokeText(text2, x2 + 10, y2 + 15);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.fillText(text2, x2 + 10, y2 + 15);
          }
        } else {
          // Original layout for larger measurements
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

          // Enhanced overlap resolution
          for (let i = 0; i < textPositions.length; i++) {
            for (let j = i + 1; j < textPositions.length; j++) {
              const pos1 = textPositions[i];
              const pos2 = textPositions[j];
              
              const dx = Math.abs(pos1.x - pos2.x);
              const dy = Math.abs(pos1.y - pos2.y);
              
              if (dx < 120 && dy < 25) {
                // Move second text down more significantly
                pos2.y += 25;
              }
            }
          }

          // Draw all coordinate texts
          textPositions.forEach(({ x, y, text }) => {
            drawOutlinedText(text, x, y);
          });

          // Draw delta labels between points
          if (scaled.coordinates.length > 1) {
            scaled.coordinates.forEach((coord, index) => {
              if (index > 0) {
                const [x, y] = coord;
                const [prevX, prevY] = scaled.coordinates[index - 1];
                const originalCoord = coordinates[index];
                const prevCoord = coordinates[index - 1];
                
                const deltaTime = Math.round(Math.abs(originalCoord[0] - prevCoord[0]) * 1000);
                const deltaFreq = Math.round(Math.abs((originalCoord[1] - prevCoord[1]) / 1000));
                
                // Position delta offset from line center
                const midX = (prevX + x) / 2;
                const midY = (prevY + y) / 2;
                
                // Check if delta would overlap with coordinate labels
                let deltaY = midY - 15; // Default: above the line
                const wouldOverlap = textPositions.some(pos => 
                  Math.abs(pos.x - midX) < 100 && Math.abs(pos.y - deltaY) < 20
                );
                
                if (wouldOverlap) {
                  deltaY = midY + 20; // Move below if overlapping
                }
                
                const deltaText = `Δt: ${deltaTime}ms, Δf: ${deltaFreq}kHz`;
                drawOutlinedText(deltaText, midX, deltaY);
              }
            });
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
