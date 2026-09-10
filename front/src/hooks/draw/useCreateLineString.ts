import { useCallback, useEffect, useState } from "react";

import drawGeometry from "@/draw/geometry";
import { DEFAULT_LINESTRING_STYLE } from "@/draw/linestring";
import {
  buildTwoPointLabelSpecs,
  drawMeasurementLabels,
  drawSinglePointLabel,
} from "@/draw/measurementLabels";
import useWindowMotions from "@/hooks/window/useWindowMotions";
import { scaleGeometryToWindow } from "@/utils/geometry";

import type { BorderStyle } from "@/draw/styles";
import type {
  Coordinates,
  LineString,
  Position,
  SpectrogramWindow,
} from "@/types";

function formatPoint(time: number, freq: number) {
  return `${Math.round(time * 1000)}ms, ${Math.round(freq / 1000)}kHz`;
}

function formatDelta(time1: number, freq1: number, time2: number, freq2: number) {
  const deltaTime = Math.round(Math.abs(time2 - time1) * 1000);
  const deltaFreq = Math.round(Math.abs((freq2 - freq1) / 1000));
  return `Δt: ${deltaTime}ms, Δf: ${deltaFreq}kHz`;
}

function drawCrosshair(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const markerSize = 5;
  ctx.strokeStyle = "white";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - markerSize, y - markerSize);
  ctx.lineTo(x + markerSize, y + markerSize);
  ctx.moveTo(x + markerSize, y - markerSize);
  ctx.lineTo(x - markerSize, y + markerSize);
  ctx.stroke();
}

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

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      if (!enabled) return;

      let scaledCoords: Coordinates[] = [];
      if (coordinates != null) {
        const geometry: LineString = { type: "LineString", coordinates };
        const scaled = scaleGeometryToWindow(geometry, window);
        drawGeometry(ctx, scaled, style);
        scaledCoords = scaled.coordinates;
        scaledCoords.forEach(([x, y]) => {
          drawCrosshair(ctx, x, y);
        });
      }

      let vertexXY: Coordinates | null = null;
      if (vertex != null) {
        const scaledVertex = scaleGeometryToWindow(
          { type: "Point", coordinates: [vertex.time, vertex.freq] },
          window,
        );
        drawGeometry(ctx, scaledVertex, style);
        vertexXY = scaledVertex.coordinates;
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

      const drawTwoPointLabels = (
        start: { x: number; y: number; time: number; freq: number },
        end: { x: number; y: number; time: number; freq: number },
      ) => {
        const specs = buildTwoPointLabelSpecs(
          ctx,
          { x: start.x, y: start.y, text: formatPoint(start.time, start.freq) },
          { x: end.x, y: end.y, text: formatPoint(end.time, end.freq) },
          formatDelta(start.time, start.freq, end.time, end.freq),
        );
        drawMeasurementLabels(ctx, specs);
      };

      if (
        vertex != null &&
        vertexXY != null &&
        coordinates != null &&
        coordinates.length > 0 &&
        scaledCoords.length > 0
      ) {
        const last = coordinates[coordinates.length - 1];
        const lastScaled = scaledCoords[scaledCoords.length - 1];
        drawTwoPointLabels(
          { x: lastScaled[0], y: lastScaled[1], time: last[0], freq: last[1] },
          { x: vertexXY[0], y: vertexXY[1], time: vertex.time, freq: vertex.freq },
        );
        return;
      }

      if (coordinates != null && coordinates.length >= 2 && scaledCoords.length >= 2) {
        drawTwoPointLabels(
          {
            x: scaledCoords[0][0],
            y: scaledCoords[0][1],
            time: coordinates[0][0],
            freq: coordinates[0][1],
          },
          {
            x: scaledCoords[1][0],
            y: scaledCoords[1][1],
            time: coordinates[1][0],
            freq: coordinates[1][1],
          },
        );
        return;
      }

      if (coordinates != null && coordinates.length === 1 && scaledCoords.length === 1) {
        drawSinglePointLabel(
          ctx,
          scaledCoords[0][0],
          scaledCoords[0][1],
          formatPoint(coordinates[0][0], coordinates[0][1]),
        );
        return;
      }

      if (vertex != null && vertexXY != null) {
        drawSinglePointLabel(
          ctx,
          vertexXY[0],
          vertexXY[1],
          formatPoint(vertex.time, vertex.freq),
        );
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
