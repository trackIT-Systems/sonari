import { CANVAS_DIMENSIONS } from "@/constants";
import type { SpectrogramWindow } from "@/types";

const FONT_SIZE = 30;
const FONT_FAMILY = "system-ui";
const COLORS = {
  ERROR: "#dc3545",
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
