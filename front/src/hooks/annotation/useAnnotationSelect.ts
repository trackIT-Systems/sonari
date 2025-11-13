import { useCallback, useEffect } from "react";
import { mergeProps, usePress } from "react-aria";

import drawGeometry from "@/draw/geometry";
import { ORANGE } from "@/draw/styles";
import useHoveredAnnotation from "@/hooks/annotation/useHoveredAnnotation";
import { scaleGeometryToWindow } from "@/utils/geometry";

import type {
  Dimensions,
  SoundEventAnnotation,
  SpectrogramWindow,
} from "@/types";

const SELECT_STYLE = {
  borderColor: ORANGE,
  fillColor: ORANGE,
  borderWidth: 2,
  fillAlpha: 0.2,
};

export default function useAnnotationSelect({
  annotations,
  window,
  enabled = true,
  onSelect,
  onDeselect,
}: {
  annotations: SoundEventAnnotation[];
  window: SpectrogramWindow;
  enabled: boolean;
  onSelect?: (annotation: SoundEventAnnotation) => void;
  onDeselect?: () => void;
}) {
  const { props: hoverProps, hoveredAnnotation: hovered } =
    useHoveredAnnotation({
      window,
      annotations,
      enabled,
    });

  const handleClick = useCallback(() => {
    if (!enabled) return;
    if (hovered == null) {
      onDeselect?.();
    } else {
      onSelect?.(hovered);
    }
  }, [hovered, enabled, onSelect, onDeselect]);

  const { pressProps } = usePress({
    onPress: handleClick,
    isDisabled: !enabled,
  });

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      if (!enabled || hovered == null) return;

      ctx.canvas.style.cursor = "pointer";

      const geometry = scaleGeometryToWindow(
        // @ts-ignore
        hovered.geometry,
        window,
      );

      drawGeometry(ctx, geometry, SELECT_STYLE);
    },
    [window, hovered, enabled],
  );

  const props = mergeProps(pressProps, hoverProps);

  return {
    props,
    draw,
  };
}
