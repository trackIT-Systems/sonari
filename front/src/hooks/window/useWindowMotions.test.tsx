import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import useWindowMotions from "@/hooks/window/useWindowMotions";
import type { Position, SpectrogramWindow } from "@/types";

const WINDOW: SpectrogramWindow = {
  time: { min: 0, max: 10 },
  freq: { min: 0, max: 1000 },
};

function Harness({
  onMove,
  onClick,
  pixelRatio = 1,
}: {
  onMove?: (props: { shift: Position }) => void;
  onClick?: (props: { position: Position }) => void;
  pixelRatio?: number;
}) {
  const { props } = useWindowMotions({ window: WINDOW, onMove, onClick });
  // A canvas drawn at screen resolution: its backing store is the 1000x384
  // window dimensions times the device pixel ratio.
  return (
    <canvas data-testid="canvas" width={1000 * pixelRatio} height={384 * pixelRatio} {...props} />
  );
}

/** Display the 1000x384 canvas at `scale` times its size. */
function displayAt(canvas: HTMLElement, scale: number) {
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, x: 0, y: 0, width: 1000 * scale, height: 384 * scale,
       right: 1000 * scale, bottom: 384 * scale, toJSON: () => ({}) }) as DOMRect;
}

/** jsdom never fills in pageX, which react-aria's useMove reads. */
function pointer(target: EventTarget, type: string, pageX: number) {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    pointerId: 1,
    pointerType: "mouse",
    clientX: pageX,
    clientY: 100,
  });
  Object.defineProperty(event, "pageX", { value: pageX });
  Object.defineProperty(event, "pageY", { value: 100 });
  act(() => {
    target.dispatchEvent(event);
  });
}

function drag(canvas: HTMLElement, dx: number) {
  pointer(canvas, "pointerdown", 100);
  pointer(window, "pointermove", 100 + dx);
  pointer(window, "pointerup", 100 + dx);
}

describe("useWindowMotions drag", () => {
  afterEach(cleanup);

  it.each([
    [1, 0.5],
    [2, 0.25],
    [0.5, 1],
  ])("converts a 50px drag on a canvas shown at %sx into %ss", (scale, seconds) => {
    const onMove = vi.fn();
    const { getByTestId } = render(<Harness onMove={onMove} />);
    const canvas = getByTestId("canvas");
    displayAt(canvas, scale);

    drag(canvas, 50);

    expect(onMove).toHaveBeenCalled();
    expect(onMove.mock.calls.at(-1)![0].shift.time).toBeCloseTo(seconds, 6);
  });
});

describe("useWindowMotions on a high resolution canvas", () => {
  afterEach(cleanup);

  it.each([1, 1.5, 2])("maps a click at pixel ratio %s to the point under the cursor", (pixelRatio) => {
    const onClick = vi.fn();
    const { getByTestId } = render(<Harness onClick={onClick} pixelRatio={pixelRatio} />);
    const canvas = getByTestId("canvas");
    displayAt(canvas, 1);

    const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 });
    Object.defineProperty(event, "offsetX", { value: 250 });
    Object.defineProperty(event, "offsetY", { value: 96 });
    act(() => {
      canvas.dispatchEvent(event);
    });

    const { position } = onClick.mock.calls.at(-1)![0];
    expect(position.time).toBeCloseTo(2.5, 6);
    expect(position.freq).toBeCloseTo(750, 6);
  });

  it.each([1, 2])("converts a 50px drag at pixel ratio %s into 0.5s", (pixelRatio) => {
    const onMove = vi.fn();
    const { getByTestId } = render(<Harness onMove={onMove} pixelRatio={pixelRatio} />);
    const canvas = getByTestId("canvas");
    displayAt(canvas, 1);

    drag(canvas, 50);

    expect(onMove.mock.calls.at(-1)![0].shift.time).toBeCloseTo(0.5, 6);
  });
});
