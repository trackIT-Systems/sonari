import { CANVAS_DIMENSIONS } from "@/constants";
import type { SpectrogramWindow } from "@/types";
import type { Chunk } from "@/utils/chunks";

const FONT_SIZE = 30;
const FONT_FAMILY = "system-ui";
const COLORS = {
  ERROR: "#dc3545",
  LOADING: "#d6d3d1",
  BACKGROUND: "#f8f9fa",
  FOREGROUND: "#212529",
};

/* Break a text into multiple lines of a given maximum width
 */
export function getLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(" ");
  const lines = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i += 1) {
    const word = words[i];
    const { width } = ctx.measureText(`${currentLine} ${word}`);
    if (width < maxWidth) {
      currentLine += ` ${word}`;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  lines.push(currentLine);
  return lines;
}

interface DrawTextConfig {
  maxWidth?: number;
  fontSize?: number;
  color?: string;
  fontAlpha?: number;
  fontFamily?: string;
  textAlign?: CanvasTextAlign;
  textBaseline?: CanvasTextBaseline;
}

interface CanvasPosition {
  x: number;
  y: number;
}

export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  position: CanvasPosition,
  {
    maxWidth,
    color = COLORS.FOREGROUND,
    fontSize = FONT_SIZE,
    fontFamily = FONT_FAMILY,
    textAlign = "center",
    textBaseline = "middle",
    fontAlpha = 1,
  }: DrawTextConfig = {},
) {
  ctx.globalAlpha = fontAlpha;
  ctx.fillStyle = color;
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.textAlign = textAlign;
  ctx.textBaseline = textBaseline;

  const lines = getLines(ctx, text, maxWidth ?? CANVAS_DIMENSIONS.width);
  const verticalOffset = (FONT_SIZE * (lines.length - 1)) / 2;

  lines.forEach((line, index) => {
    ctx.fillText(
      line,
      position.x,
      position.y + index * FONT_SIZE - verticalOffset,
      maxWidth,
    );
  });
}

export function drawLoadingState(ctx: CanvasRenderingContext2D) {
  const { canvas } = ctx;
  ctx.fillStyle = COLORS.BACKGROUND;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawText(ctx, "Loading...", { x: canvas.width / 2, y: canvas.height / 2 });
  ctx.canvas.setAttribute("class", "blink");
}

export function drawErrorState(ctx: CanvasRenderingContext2D, error: string) {
  const { canvas } = ctx;
  ctx.fillStyle = COLORS.BACKGROUND;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawText(
    ctx,
    `Error: ${error}`,
    { x: canvas.width / 2, y: canvas.height / 2 },
    { color: COLORS.ERROR, maxWidth: canvas.width * 0.8 },
  );
}

/**
 * Compute the intersection of two time-frequency windows
 */
function intersectWindows(
  window1: SpectrogramWindow,
  window2: SpectrogramWindow,
): SpectrogramWindow | null {
  const timeMin = Math.max(window1.time.min, window2.time.min);
  const timeMax = Math.min(window1.time.max, window2.time.max);
  const freqMin = Math.max(window1.freq.min, window2.freq.min);
  const freqMax = Math.min(window1.freq.max, window2.freq.max);

  if (timeMin >= timeMax || freqMin >= freqMax) return null;

  return {
    time: { min: timeMin, max: timeMax },
    freq: { min: freqMin, max: freqMax },
  };
}

/**
 * Get pixel position of a viewport within bounds
 */
function getViewportPosition({
  width,
  height,
  viewport,
  bounds,
}: {
  width: number;
  height: number;
  viewport: SpectrogramWindow;
  bounds: SpectrogramWindow;
}): {
  left: number;
  width: number;
  top: number;
  height: number;
} {
  const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

  const bottom =
    (bounds.freq.max - viewport.freq.min) / (bounds.freq.max - bounds.freq.min);
  const top =
    (bounds.freq.max - viewport.freq.max) / (bounds.freq.max - bounds.freq.min);
  const left =
    (viewport.time.min - bounds.time.min) / (bounds.time.max - bounds.time.min);
  const right =
    (viewport.time.max - bounds.time.min) / (bounds.time.max - bounds.time.min);

  return {
    top: clamp(top * height, 0, height),
    left: clamp(left * width, 0, width),
    height: clamp((bottom - top) * height, 0, height),
    width: clamp((right - left) * width, 0, width),
  };
}

export function drawImageOnCanvas(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  window: SpectrogramWindow,
  segment: SpectrogramWindow,
) {
  ctx.fillStyle = COLORS.BACKGROUND;
  ctx.clearRect(0, 0, CANVAS_DIMENSIONS.width, CANVAS_DIMENSIONS.height);

  const interval = segment.time;
  const maxFreq = segment.freq.max;

  const totalDuration = interval.max - interval.min;
  const startTimeRel = (window.time.min - interval.min) / totalDuration;
  const highFreqRel = window.freq.max / maxFreq;

  const sx = startTimeRel * image.width;
  const sy = (1 - highFreqRel) * image.height;
  const sWidth = ((window.time.max - window.time.min) * image.width) / totalDuration;
  const sHeight = ((window.freq.max - window.freq.min) * image.height) / maxFreq;

  console.log('Drawing:', {
    windowTime: `${window.time.min}-${window.time.max} (${window.time.max - window.time.min}s)`,
    segmentTime: `${segment.time.min}-${segment.time.max} (${segment.time.max - segment.time.min}s)`,
    imageSize: `${image.width}x${image.height}`,
    calculated: { sx, sy, sWidth, sHeight, totalDuration }
  });

  ctx.globalAlpha = 1;
  ctx.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, CANVAS_DIMENSIONS.width, CANVAS_DIMENSIONS.height);
}

export interface DrawImageProps {
  ctx: CanvasRenderingContext2D;
  image: HTMLImageElement;
  window: SpectrogramWindow;
  segment: SpectrogramWindow;
}

export default function drawImage({
  ctx,
  image,
  window,
  segment,
}: DrawImageProps) {
  ctx.canvas.setAttribute("class", "");
  drawImageOnCanvas(ctx, image, window, segment);
}

/**
 * Draw a single chunk with proper stitching
 */
function drawChunk({
  ctx,
  image,
  viewport,
  chunkBounds,
  buffer,
  isLoading,
  isError,
}: {
  ctx: CanvasRenderingContext2D;
  image: HTMLImageElement | null;
  viewport: SpectrogramWindow;
  chunkBounds: SpectrogramWindow;
  buffer: SpectrogramWindow;
  isLoading: boolean;
  isError: boolean;
}) {
  const intersection = intersectWindows(viewport, chunkBounds);

  if (!intersection) {
    return;
  }

  // Show loading state for this chunk region
  if (isLoading || !image) {
    const position = getViewportPosition({
      width: CANVAS_DIMENSIONS.width,
      height: CANVAS_DIMENSIONS.height,
      viewport: intersection,
      bounds: viewport,
    });
    ctx.fillStyle = COLORS.LOADING;
    ctx.fillRect(position.left, position.top, position.width, position.height);
    return;
  }

  // Show error state for this chunk region
  if (isError) {
    const position = getViewportPosition({
      width: CANVAS_DIMENSIONS.width,
      height: CANVAS_DIMENSIONS.height,
      viewport: intersection,
      bounds: viewport,
    });
    ctx.fillStyle = COLORS.ERROR;
    ctx.fillRect(position.left, position.top, position.width, position.height);
    return;
  }

  // Calculate source rectangle (portion of chunk image to use)
  const source = getViewportPosition({
    width: image.width,
    height: image.height,
    viewport: intersection,
    bounds: buffer,
  });

  // Calculate destination rectangle (where to draw on canvas)
  const destination = getViewportPosition({
    width: CANVAS_DIMENSIONS.width,
    height: CANVAS_DIMENSIONS.height,
    viewport: intersection,
    bounds: viewport,
  });

  // Draw this portion of the chunk
  ctx.globalAlpha = 1;
  ctx.drawImage(
    image,
    source.left,
    source.top,
    source.width + 1,
    source.height,
    destination.left,
    destination.top,
    destination.width + 1,
    destination.height,
  );
}

export interface DrawStitchedImageProps {
  ctx: CanvasRenderingContext2D;
  viewport: SpectrogramWindow;
  chunks: Array<{
    chunk: Chunk;
    image: HTMLImageElement | null;
    isLoading: boolean;
    isError: boolean;
  }>;
  samplerate: number;
}

/**
 * Draw multiple spectrogram chunks stitched together
 */
export function drawStitchedImage({
  ctx,
  viewport,
  chunks,
  samplerate,
}: DrawStitchedImageProps) {
  // Clear the canvas
  ctx.clearRect(0, 0, CANVAS_DIMENSIONS.width, CANVAS_DIMENSIONS.height);
  ctx.fillStyle = COLORS.BACKGROUND;
  ctx.fillRect(0, 0, CANVAS_DIMENSIONS.width, CANVAS_DIMENSIONS.height);

  // Draw each chunk
  chunks.forEach(({ chunk, image, isLoading, isError }) => {
    const chunkBounds: SpectrogramWindow = {
      time: chunk.interval,
      freq: { min: 0, max: samplerate / 2 },
    };

    const buffer: SpectrogramWindow = {
      time: chunk.buffer,
      freq: { min: 0, max: samplerate / 2 },
    };

    drawChunk({
      ctx,
      image,
      viewport,
      chunkBounds,
      buffer,
      isLoading,
      isError,
    });
  });
}
