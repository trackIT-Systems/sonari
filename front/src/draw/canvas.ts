/**
 * Size of a canvas in drawing units.
 *
 * A canvas drawn at a higher resolution than its CSS size (see
 * `useDevicePixelRatio`) is scaled with `setTransform`, so drawing code keeps
 * working in CSS pixels. This divides the backing store size by that scale; for
 * an unscaled canvas it is simply the canvas size.
 */
export function getCanvasSize(ctx: CanvasRenderingContext2D): {
  width: number;
  height: number;
} {
  const transform = ctx.getTransform?.();
  const scaleX = transform?.a || 1;
  const scaleY = transform?.d || 1;
  return {
    width: ctx.canvas.width / scaleX,
    height: ctx.canvas.height / scaleY,
  };
}
