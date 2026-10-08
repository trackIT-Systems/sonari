import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import useWindowMotions from "@/hooks/window/useWindowMotions";
import type { Position, SpectrogramWindow } from "@/types";

const WINDOW: SpectrogramWindow = {
  time: { min: 0, max: 10 },
  freq: { min: 0, max: 1000 },
};

function Harness({ onMove }: { onMove: (props: { shift: Position }) => void }) {
  const { props } = useWindowMotions({ window: WINDOW, onMove });
  return <canvas data-testid="canvas" width={1000} height={384} {...props} />;
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
