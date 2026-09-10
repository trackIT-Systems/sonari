/** Collision-aware measurement labels for spectrogram/waveform tools. */

const PADDING_X = 4;
const PADDING_Y = 3;
const LABEL_GAP = 6;
const EDGE_MARGIN = 4;
const POINT_CLEARANCE = 10;
const CLUSTER_DISTANCE = 56;

const POINT_FONT = "11px sans-serif";
const DELTA_FONT = "13px sans-serif";

export type LabelSpec = {
  text: string;
  font: string;
  preferredLeft: number;
  preferredTop: number;
};

export type PlacedLabel = {
  text: string;
  font: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

type Box = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function measureMeasurementLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: string,
): { width: number; height: number } {
  ctx.font = font;
  const metrics = ctx.measureText(text);
  const ascent = metrics.actualBoundingBoxAscent ?? 9;
  const descent = metrics.actualBoundingBoxDescent ?? 3;
  const textHeight = Math.max(12, Math.ceil(ascent + descent));
  return {
    width: Math.ceil(metrics.width) + PADDING_X * 2,
    height: textHeight + PADDING_Y * 2,
  };
}

function boxesOverlap(a: Box, b: Box, gap: number = LABEL_GAP): boolean {
  return (
    a.left < b.left + b.width + gap &&
    a.left + a.width + gap > b.left &&
    a.top < b.top + b.height + gap &&
    a.top + a.height + gap > b.top
  );
}

function clampBox(box: Box, canvasWidth: number, canvasHeight: number) {
  const maxLeft = Math.max(EDGE_MARGIN, canvasWidth - box.width - EDGE_MARGIN);
  const maxTop = Math.max(EDGE_MARGIN, canvasHeight - box.height - EDGE_MARGIN);
  box.left = Math.min(Math.max(box.left, EDGE_MARGIN), maxLeft);
  box.top = Math.min(Math.max(box.top, EDGE_MARGIN), maxTop);
}

function boxAwayFromPoint(
  x: number,
  y: number,
  otherX: number,
  otherY: number,
  size: { width: number; height: number },
): Box {
  const awayX = x - otherX;
  const awayY = y - otherY;

  if (Math.abs(awayX) >= Math.abs(awayY)) {
    return {
      left: awayX >= 0 ? x + POINT_CLEARANCE : x - POINT_CLEARANCE - size.width,
      top: y - size.height / 2,
      width: size.width,
      height: size.height,
    };
  }

  return {
    left: x - size.width / 2,
    top: awayY >= 0 ? y + POINT_CLEARANCE : y - POINT_CLEARANCE - size.height,
    width: size.width,
    height: size.height,
  };
}

function clusteredLabelSpecs(
  cx: number,
  cy: number,
  canvasWidth: number,
  canvasHeight: number,
  point1: { text: string; size: { width: number; height: number } },
  point2: { text: string; size: { width: number; height: number } },
  delta: { text: string; size: { width: number; height: number } },
): LabelSpec[] {
  const spaceAbove = cy;
  const spaceBelow = canvasHeight - cy;
  const placeAbove = spaceAbove >= spaceBelow && spaceAbove > 48;

  const spreadX = 10;
  const spreadY = 12;

  if (placeAbove) {
    return [
      {
        text: point1.text,
        font: POINT_FONT,
        preferredLeft: cx - spreadX - point1.size.width,
        preferredTop: cy - spreadY - point1.size.height,
      },
      {
        text: point2.text,
        font: POINT_FONT,
        preferredLeft: cx + spreadX,
        preferredTop: cy - spreadY - point2.size.height,
      },
      {
        text: delta.text,
        font: DELTA_FONT,
        preferredLeft: cx - delta.size.width / 2,
        preferredTop: cy + spreadY,
      },
    ];
  }

  const belowTop = cy + spreadY;
  const stacked =
    belowTop + point1.size.height + point2.size.height + delta.size.height + LABEL_GAP * 2 >
    canvasHeight - EDGE_MARGIN;

  if (stacked) {
    // Not enough room to fan out; stack to the side with more horizontal space.
    const stackLeft =
      cx > canvasWidth / 2
        ? cx - spreadX - Math.max(point1.size.width, point2.size.width, delta.size.width)
        : cx + spreadX;
    return [
      {
        text: point1.text,
        font: POINT_FONT,
        preferredLeft: stackLeft,
        preferredTop: cy - point1.size.height - LABEL_GAP,
      },
      {
        text: point2.text,
        font: POINT_FONT,
        preferredLeft: stackLeft,
        preferredTop: cy,
      },
      {
        text: delta.text,
        font: DELTA_FONT,
        preferredLeft: stackLeft,
        preferredTop: cy + point2.size.height + LABEL_GAP,
      },
    ];
  }

  return [
    {
      text: point1.text,
      font: POINT_FONT,
      preferredLeft: cx - spreadX - point1.size.width,
      preferredTop: belowTop,
    },
    {
      text: point2.text,
      font: POINT_FONT,
      preferredLeft: cx + spreadX,
      preferredTop: belowTop,
    },
    {
      text: delta.text,
      font: DELTA_FONT,
      preferredLeft: cx - delta.size.width / 2,
      preferredTop: belowTop + Math.max(point1.size.height, point2.size.height) + LABEL_GAP,
    },
  ];
}

export function buildTwoPointLabelSpecs(
  ctx: CanvasRenderingContext2D,
  point1: { x: number; y: number; text: string },
  point2: { x: number; y: number; text: string },
  deltaText: string,
): LabelSpec[] {
  const size1 = measureMeasurementLabel(ctx, point1.text, POINT_FONT);
  const size2 = measureMeasurementLabel(ctx, point2.text, POINT_FONT);
  const sizeDelta = measureMeasurementLabel(ctx, deltaText, DELTA_FONT);

  const dx = point2.x - point1.x;
  const dy = point2.y - point1.y;
  const dist = Math.hypot(dx, dy);

  const box1 = boxAwayFromPoint(point1.x, point1.y, point2.x, point2.y, size1);
  const box2 = boxAwayFromPoint(point2.x, point2.y, point1.x, point1.y, size2);

  if (dist < CLUSTER_DISTANCE || boxesOverlap(box1, box2, LABEL_GAP)) {
    return clusteredLabelSpecs(
      (point1.x + point2.x) / 2,
      (point1.y + point2.y) / 2,
      ctx.canvas.width,
      ctx.canvas.height,
      { text: point1.text, size: size1 },
      { text: point2.text, size: size2 },
      { text: deltaText, size: sizeDelta },
    );
  }

  const midX = (point1.x + point2.x) / 2;
  const midY = (point1.y + point2.y) / 2;
  const lineAngle = Math.atan2(dy, dx);
  const perpAngle = lineAngle + Math.PI / 2;
  const offset = 28;

  const deltaCandidates: Box[] = [1, -1].map((sign) => ({
    left: midX + Math.cos(perpAngle) * offset * sign - sizeDelta.width / 2,
    top: midY + Math.sin(perpAngle) * offset * sign - sizeDelta.height / 2,
    width: sizeDelta.width,
    height: sizeDelta.height,
  }));

  const deltaBox =
    deltaCandidates.find(
      (candidate) =>
        !boxesOverlap(candidate, box1, LABEL_GAP) &&
        !boxesOverlap(candidate, box2, LABEL_GAP),
    ) ?? deltaCandidates[0];

  return [
    {
      text: point1.text,
      font: POINT_FONT,
      preferredLeft: box1.left,
      preferredTop: box1.top,
    },
    {
      text: point2.text,
      font: POINT_FONT,
      preferredLeft: box2.left,
      preferredTop: box2.top,
    },
    {
      text: deltaText,
      font: DELTA_FONT,
      preferredLeft: deltaBox.left,
      preferredTop: deltaBox.top,
    },
  ];
}

export function placeMeasurementLabels(
  ctx: CanvasRenderingContext2D,
  specs: LabelSpec[],
): PlacedLabel[] {
  const canvasWidth = ctx.canvas.width;
  const canvasHeight = ctx.canvas.height;

  const labels: PlacedLabel[] = specs.map((spec) => {
    const size = measureMeasurementLabel(ctx, spec.text, spec.font);
    const label: PlacedLabel = {
      text: spec.text,
      font: spec.font,
      left: spec.preferredLeft,
      top: spec.preferredTop,
      width: size.width,
      height: size.height,
    };
    clampBox(label, canvasWidth, canvasHeight);
    return label;
  });

  for (let iter = 0; iter < 12; iter += 1) {
    let moved = false;

    for (let i = 0; i < labels.length; i += 1) {
      for (let j = i + 1; j < labels.length; j += 1) {
        const a = labels[i];
        const b = labels[j];
        if (!boxesOverlap(a, b, LABEL_GAP)) continue;

        moved = true;

        const dx = a.left + a.width / 2 - (b.left + b.width / 2);
        const dy = a.top + a.height / 2 - (b.top + b.height / 2);
        const overlapX = (a.width + b.width) / 2 + LABEL_GAP - Math.abs(dx);
        const overlapY = (a.height + b.height) / 2 + LABEL_GAP - Math.abs(dy);

        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
          b.top = a.top + a.height + LABEL_GAP;
        } else if (overlapX <= overlapY) {
          const dir = dx >= 0 ? 1 : -1;
          a.left += (dir * overlapX) / 2;
          b.left -= (dir * overlapX) / 2;
        } else {
          const dir = dy >= 0 ? 1 : -1;
          a.top += (dir * overlapY) / 2;
          b.top -= (dir * overlapY) / 2;
        }
      }
    }

    for (const label of labels) {
      clampBox(label, canvasWidth, canvasHeight);
    }

    if (!moved) break;
  }

  // If two labels are still overlapping after clamping (same canvas edge),
  // stack them so the text stays readable.
  for (let i = 0; i < labels.length; i += 1) {
    for (let j = i + 1; j < labels.length; j += 1) {
      const a = labels[i];
      const b = labels[j];
      if (!boxesOverlap(a, b, LABEL_GAP)) continue;

      const upper = a.top <= b.top ? a : b;
      const lower = upper === a ? b : a;
      lower.top = upper.top + upper.height + LABEL_GAP;
      clampBox(lower, canvasWidth, canvasHeight);

      if (boxesOverlap(upper, lower, LABEL_GAP)) {
        upper.top = Math.max(
          EDGE_MARGIN,
          lower.top - upper.height - LABEL_GAP,
        );
        clampBox(upper, canvasWidth, canvasHeight);
      }
    }
  }

  return labels;
}

export function drawMeasurementLabel(
  ctx: CanvasRenderingContext2D,
  label: PlacedLabel,
) {
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(label.left, label.top, label.width, label.height);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
  ctx.lineWidth = 1;
  ctx.strokeRect(label.left, label.top, label.width, label.height);

  ctx.font = label.font;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "white";
  ctx.fillText(label.text, label.left + PADDING_X, label.top + label.height / 2);
}

export function drawMeasurementLabels(
  ctx: CanvasRenderingContext2D,
  specs: LabelSpec[],
) {
  const placed = placeMeasurementLabels(ctx, specs);
  for (const label of placed) {
    drawMeasurementLabel(ctx, label);
  }
}

export function drawSinglePointLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
) {
  const font = "12px sans-serif";
  const size = measureMeasurementLabel(ctx, text, font);
  drawMeasurementLabels(ctx, [
    {
      text,
      font,
      preferredLeft: x + 8,
      preferredTop: y - size.height - 4,
    },
  ]);
}
