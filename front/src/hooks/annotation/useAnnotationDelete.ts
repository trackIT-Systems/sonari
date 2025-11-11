import { useCallback } from "react";
import { mergeProps, usePress } from "react-aria";

import drawGeometry from "@/draw/geometry";
import { RED } from "@/draw/styles";
import useHoveredAnnotation from "@/hooks/annotation/useHoveredAnnotation";
import { scaleGeometryToWindow } from "@/utils/geometry";

import type {
  Dimensions,
  SoundEventAnnotation,
  SpectrogramWindow,
} from "@/types";

const DELETE_STYLE = {
  borderColor: RED,
  fillColor: RED,
  borderWidth: 3,
  fillAlpha: 0.2,
};

export default function useAnnotationDelete({
  annotations,
  window,
  dimensions,
  enabled = true,
  onDelete,
  onDeselect,
}: {
  annotations: SoundEventAnnotation[];
  dimensions: Dimensions;
  window: SpectrogramWindow;
  enabled: boolean;
  onDelete?: (annotation: SoundEventAnnotation) => void;
  onDeselect?: () => void;
}) {
  const {
    props: hoverProps,
    hoveredAnnotation: hovered,
    clear,
  } = useHoveredAnnotation({
    window,
    dimensions,
    annotations,
    enabled,
  });

  const handleClick = useCallback(() => {
    if (!enabled) return;
    if (hovered == null) {
      onDeselect?.();
    } else {
      onDelete?.(hovered);
      clear();
    }
  }, [hovered, enabled, onDelete, onDeselect, clear]);

  const { pressProps } = usePress({
    onPress: handleClick,
    isDisabled: !enabled,
  });

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      if (!enabled || hovered == null) return;
      ctx.canvas.style.cursor = "pointer";
      const geometry = scaleGeometryToWindow(
        { width: ctx.canvas.width, height: ctx.canvas.height },
        hovered.geometry,
        window,
      );

      drawGeometry(ctx, geometry, DELETE_STYLE);
    },
    [window, hovered, enabled],
  );

  const props = mergeProps(pressProps, hoverProps);

  return {
    props,
    draw,
  };
}
