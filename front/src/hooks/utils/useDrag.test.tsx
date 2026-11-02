import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import useDrag from "@/hooks/utils/useDrag";
import type { Pixel } from "@/types";

function Harness({
  onMove,
}: {
  onMove: (props: { initial: Pixel; current: Pixel }) => void;
}) {
  const { props } = useDrag<HTMLCanvasElement>({ onMove });
  return <canvas data-testid="canvas" width={1000} height={384} {...props} />;
}

function displayAt(canvas: HTMLElement, scale: number) {
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, x: 0, y: 0, width: 1000 * scale, height: 384 * scale,
       right: 1000 * scale, bottom: 384 * scale, toJSON: () => ({}) }) as DOMRect;
}

/** jsdom never fills in pageX, which react-aria's useMove reads. */
function pointer(target: EventTarget, type: string, pageX: number) {
  const event = new PointerEvent(type, {
    bubbles: true, cancelable: true, button: 0, pointerId: 1,
    pointerType: "mouse", clientX: pageX, clientY: 100,
  });
  Object.defineProperty(event, "pageX", { value: pageX });
  Object.defineProperty(event, "pageY", { value: 100 });
  act(() => {
    target.dispatchEvent(event);
  });
}

describe("useDrag", () => {
  afterEach(cleanup);

  it.each([
    [1, 50],
    [2, 25],
    [0.5, 100],
  ])("moves %sx-displayed canvases by the drag in canvas pixels", (scale, expected) => {
    const onMove = vi.fn();
    const { getByTestId } = render(<Harness onMove={onMove} />);
    const canvas = getByTestId("canvas");
    displayAt(canvas, scale);

    pointer(canvas, "pointerdown", 100);
    pointer(window, "pointermove", 150);
    pointer(window, "pointerup", 150);

    const { initial, current } = onMove.mock.calls.at(-1)![0];
    expect(current.x - initial.x).toBeCloseTo(expected, 6);
  });
});
