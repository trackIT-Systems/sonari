import { SPECTROGRAM_CANVAS_DIMENSIONS } from "@/constants";
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
      width: SPECTROGRAM_CANVAS_DIMENSIONS.width,
      height: SPECTROGRAM_CANVAS_DIMENSIONS.height,
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
      width: SPECTROGRAM_CANVAS_DIMENSIONS.width,
      height: SPECTROGRAM_CANVAS_DIMENSIONS.height,
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
    width: SPECTROGRAM_CANVAS_DIMENSIONS.width,
    height: SPECTROGRAM_CANVAS_DIMENSIONS.height,
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

interface DrawStitchedImageProps {
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
  ctx.clearRect(0, 0, SPECTROGRAM_CANVAS_DIMENSIONS.width, SPECTROGRAM_CANVAS_DIMENSIONS.height);
  ctx.fillStyle = COLORS.BACKGROUND;
  ctx.fillRect(0, 0, SPECTROGRAM_CANVAS_DIMENSIONS.width, SPECTROGRAM_CANVAS_DIMENSIONS.height);

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
