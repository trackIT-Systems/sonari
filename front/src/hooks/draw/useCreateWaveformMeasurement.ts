import { useCallback, useEffect, useState } from "react";

import { DEFAULT_LINESTRING_STYLE } from "@/draw/linestring";
import useWindowMotions from "@/hooks/window/useWindowMotions";

import type { BorderStyle } from "@/draw/styles";
import type {
  Coordinates,
  Dimensions,
  LineString,
  Position,
  SpectrogramWindow,
} from "@/types";

export default function useCreateWaveformMeasurement({
  window,
  dimensions,
  enabled = true,
  style = DEFAULT_LINESTRING_STYLE,
  onCreate,
}: {
  window: SpectrogramWindow;
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
        freq: initial.freq - shift.freq, // Keep freq for internal calculations
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
    dimensions,
    onClick: handleClick,
    onMoveStart: handleMoveStart,
    onMove: handleMove,
    onMoveEnd: handleMoveEnd,
  });

  // Waveform-specific drawing function
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      if (!enabled) return;

      const { width, height } = ctx.canvas;

      if (coordinates != null) {
        // Convert time coordinates to canvas x positions
        const timeCoords = coordinates.map(coord => coord[0]);
        const minTime = Math.min(...timeCoords);
        const maxTime = Math.max(...timeCoords);
        
        const timeRange = window.time.max - window.time.min;
        const minX = ((minTime - window.time.min) / timeRange) * width;
        const maxX = ((maxTime - window.time.min) / timeRange) * width;

        // Draw highlighted region
        ctx.fillStyle = "rgba(16, 185, 129, 0.2)"; // Green background
        ctx.fillRect(minX, 0, maxX - minX, height);

        // Draw vertical lines at start and end
        ctx.strokeStyle = "rgba(16, 185, 129, 0.8)";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        
        ctx.beginPath();
        ctx.moveTo(minX, 0);
        ctx.lineTo(minX, height);
        ctx.moveTo(maxX, 0);
        ctx.lineTo(maxX, height);
        ctx.stroke();
        ctx.setLineDash([]);

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

        // Draw time markers and labels (no frequency)
        coordinates.forEach((coord, index) => {
          const timeCoord = coord[0];
          const x = ((timeCoord - window.time.min) / timeRange) * width;
          
          // Draw small vertical marker
          ctx.strokeStyle = 'white';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(x, height * 0.1);
          ctx.lineTo(x, height * 0.9);
          ctx.stroke();
          
          // Draw time label (no frequency information)
          const timeValue = Math.round(timeCoord * 1000);
          const text = `${timeValue}ms`;
          
          let textY = 20; // Position at top
          if (index > 0) {
            textY = height - 10; // Alternate position for second marker
          }
          
          drawOutlinedText(text, x + 5, textY);
        });

        // Draw delta time in the middle
        if (coordinates.length > 1) {
          const deltaTime = Math.round(Math.abs(timeCoords[1] - timeCoords[0]) * 1000);
          const midX = (minX + maxX) / 2;
          const deltaText = `Δt: ${deltaTime}ms`;
          drawOutlinedText(deltaText, midX - 30, height / 2);
        }
      }

      // Draw current vertex being dragged
      if (vertex != null) {
        const timeRange = window.time.max - window.time.min;
        const x = ((vertex.time - window.time.min) / timeRange) * width;
        
        // Draw vertical line
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.8)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Draw time label
        const timeValue = Math.round(vertex.time * 1000);
        const text = `${timeValue}ms`;
        
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        
        // Draw black outline
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 3;
        ctx.strokeText(text, x + 5, 20);
        
        // Draw white text on top
        ctx.fillStyle = 'white';
        ctx.fillText(text, x + 5, 20);
      }
    },
    [enabled, coordinates, window, vertex],
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