import { useCallback, useEffect, useState } from "react";

import { DEFAULT_LINESTRING_STYLE } from "@/draw/linestring";
import {
  drawMeasurementLabels,
  measureMeasurementLabel,
  type LabelSpec,
} from "@/draw/measurementLabels";
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
  enabled = true,
  onCreate,
}: {
  window: SpectrogramWindow;
  enabled?: boolean;
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

        const labelFont = "12px sans-serif";
        const labelSpecs: LabelSpec[] = [];

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
          
          const text = `${Math.round(timeCoord * 1000)}ms`;
          const size = measureMeasurementLabel(ctx, text, labelFont);
          labelSpecs.push({
            text,
            font: labelFont,
            preferredLeft: x + 5,
            preferredTop: index === 0 ? 6 : height - size.height - 6,
          });
        });

        // Draw delta time in the middle, offset when the span is too narrow
        if (coordinates.length > 1) {
          const deltaTime = Math.round(Math.abs(timeCoords[1] - timeCoords[0]) * 1000);
          const deltaText = `Δt: ${deltaTime}ms`;
          const size = measureMeasurementLabel(ctx, deltaText, labelFont);
          const span = Math.abs(maxX - minX);
          const midX = (minX + maxX) / 2;
          const preferredLeft =
            span < size.width + 16 ? Math.max(minX, maxX) + 8 : midX - size.width / 2;
          labelSpecs.push({
            text: deltaText,
            font: labelFont,
            preferredLeft,
            preferredTop: height / 2 - size.height / 2,
          });
        }

        drawMeasurementLabels(ctx, labelSpecs);
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
        
        const text = `${Math.round(vertex.time * 1000)}ms`;
        const labelFont = "12px sans-serif";
        const size = measureMeasurementLabel(ctx, text, labelFont);
        // Keep the live cursor label at the bottom so it does not cover the first marker.
        drawMeasurementLabels(ctx, [
          {
            text,
            font: labelFont,
            preferredLeft: x + 5,
            preferredTop: height - size.height - 6,
          },
        ]);
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