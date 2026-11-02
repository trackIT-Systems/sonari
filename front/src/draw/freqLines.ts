import { drawLineString, DEFAULT_LINESTRING_STYLE } from "@/draw/linestring";
import { setFontStyle } from "@/draw/styles";

import type { SpectrogramWindow } from "@/types";

export const FREQ_LINE_COLORS = [
  "rgb(34 211 238)",  // cyan-400
  "rgb(56 189 248)",  // sky-400
  "rgb(52 211 153)",  // emerald-400
  "rgb(163 230 53)",  // lime-400
  "rgb(96 165 250)",  // blue-400
  "rgb(45 212 191)",  // teal-400
  "rgb(167 139 250)", // violet-400
  "rgb(244 114 182)", // pink-400
];

export function drawFrequencyLines(
  ctx: CanvasRenderingContext2D,
  freqLines: number[],
  window: SpectrogramWindow,
  style = DEFAULT_LINESTRING_STYLE
) {
  const { height, width } = ctx.canvas;
  const { min: freqMin, max: freqMax } = window.freq;

  for (const freq of freqLines) {
    if (freq < freqMin || freq > freqMax) continue;

    const y = height * (1 - (freq - freqMin) / (freqMax - freqMin));

    const line = {
      type: "LineString" as const,
      coordinates: [
        [0, y],
        [width, y],
      ],
    };

    const lineWidth = style.borderWidth ?? DEFAULT_LINESTRING_STYLE.borderWidth ?? 2;

    // Dark outline keeps lines readable on bright spectrogram regions (e.g. without de-noise)
    drawLineString(ctx, line, {
      borderColor: "rgb(0 0 0)",
      borderWidth: lineWidth + 2,
      borderAlpha: 0.75,
    });
    drawLineString(ctx, line, {
      ...style,
      borderWidth: lineWidth,
    });

    // Draw the frequency label
    ctx.save();

    setFontStyle(ctx, { fontSize: 10, fontColor: style.borderColor });
    
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    
    // Format frequency for display (convert Hz to kHz if >= 1000)
    const freqLabel = freq >= 1000 ? `${(freq / 1000).toFixed(0)} kHz` : `${freq} Hz`;
    
    // Position text slightly to the left and above the line
    const textX = 8; // 8 pixels from left edge
    const textY = y - 4; // 4 pixels above the line
    
    // Only draw label if it's within visible bounds
    if (textY > 0 && textY < height) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgb(0 0 0)";
      ctx.strokeText(freqLabel, textX, textY);
      ctx.fillText(freqLabel, textX, textY);
    }
    
    ctx.restore();
  }
}

/** Draw every frequency line, each in its own colour. */
export function drawAllFrequencyLines(
  ctx: CanvasRenderingContext2D,
  freqLines: number[] | undefined,
  window: SpectrogramWindow,
) {
  if (!freqLines || !Array.isArray(freqLines)) return;
  freqLines.forEach((freq, index) => {
    drawFrequencyLines(ctx, [freq], window, {
      borderColor: FREQ_LINE_COLORS[index % FREQ_LINE_COLORS.length],
      borderWidth: 2,
      borderAlpha: 1,
    });
  });
}
