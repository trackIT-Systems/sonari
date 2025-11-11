import { useCallback, useMemo } from "react";

import { type Style } from "@/draw/styles";
import useEditGeometry from "@/hooks/edit/useEditGeometry";
import {
  scaleGeometryToWindow,
} from "@/utils/geometry";

import type {
  Dimensions,
  Geometry,
  SoundEventAnnotation,
  SpectrogramWindow,
} from "@/types";

export default function useEditAnnotationGeometry({
  window,
  dimensions,
  soundEventAnnotation,
  enabled = true,
  onChange,
  onCopy,
  onDeselect,
  style,
}: {
  window: SpectrogramWindow;
  dimensions: Dimensions;
  soundEventAnnotation: SoundEventAnnotation | null;
  enabled?: boolean;
  onChange?: (geometry: Geometry) => void;
  onCopy?: (geometry: Geometry) => void;
  onDeselect?: () => void;
  style?: Style;
}) {
  const { geometry } = soundEventAnnotation ?? {};

  const scaledGeometry = useMemo(() => {
    if (geometry == null) return null;
    return scaleGeometryToWindow(dimensions, geometry, window);
  }, [geometry, window, dimensions]);

  const handleOnChange = useCallback(
    (geometry?: Geometry) => {
      if (geometry == null) return;
      const rescaled = scaleGeometryToWindow(dimensions, geometry, window);
      onChange?.(rescaled);
    },
    [onChange, window, dimensions],
  );

  const handleOnCopy = useCallback(
    (geometry?: Geometry) => {
      if (geometry == null) return;
      const rescaled = scaleGeometryToWindow(dimensions, geometry, window);
      onCopy?.(rescaled);
    },
    [onCopy, window, dimensions],
  );

  const ret = useEditGeometry({
    dimensions,
    object: scaledGeometry,
    enabled: enabled,
    style: style,
    onDrop: handleOnCopy,
    onChange: handleOnChange,
    onDeselect: onDeselect,
  });

  const reconstructed = useMemo(() => {
    if (ret.object === null) return null;
    return scaleGeometryToWindow(dimensions, ret.object, window);
  }, [dimensions, window, ret.object]);

  return {
    ...ret,
    geometry: reconstructed,
  };
}
