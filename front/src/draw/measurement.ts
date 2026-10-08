/** Shared drawing helpers for the two point measurement tool. */

import {
  buildTwoPointLabelSpecs,
  drawMeasurementLabels,
} from "@/draw/measurementLabels";

export function formatMeasurementPoint(time: number, freq: number) {
  return `${Math.round(time * 1000)}ms, ${Math.round(freq / 1000)}kHz`;
}

export function formatMeasurementDelta(
  time1: number,
  freq1: number,
  time2: number,
  freq2: number,
) {
  const deltaTime = Math.round(Math.abs(time2 - time1) * 1000);
  const deltaFreq = Math.round(Math.abs((freq2 - freq1) / 1000));
  return `Δt: ${deltaTime}ms, Δf: ${deltaFreq}kHz`;
}

export function drawMeasurementCrosshair(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
) {
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

export function drawTwoPointMeasurementLabels(
  ctx: CanvasRenderingContext2D,
  start: { x: number; y: number; time: number; freq: number },
  end: { x: number; y: number; time: number; freq: number },
) {
  const specs = buildTwoPointLabelSpecs(
    ctx,
    { x: start.x, y: start.y, text: formatMeasurementPoint(start.time, start.freq) },
    { x: end.x, y: end.y, text: formatMeasurementPoint(end.time, end.freq) },
    formatMeasurementDelta(start.time, start.freq, end.time, end.freq),
  );
  drawMeasurementLabels(ctx, specs);
}
