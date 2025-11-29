import { useCallback, useMemo } from "react";

import { type Style } from "@/draw/styles";
import useEditGeometry from "@/hooks/edit/useEditGeometry";
import {
  scaleGeometryToWindow,
  scaleGeometryFromWindow,
} from "@/utils/geometry";

import type {
  Geometry,
  SoundEventAnnotation,
  SpectrogramWindow,
} from "@/types";

export default function useEditAnnotationGeometry({
  window,
  soundEventAnnotation,
  enabled = true,
  onChange,
  onCopy,
  onDeselect,
  style,
}: {
  window: SpectrogramWindow;
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
    return scaleGeometryToWindow(geometry, window);
  }, [geometry, window]);

  const handleOnChange = useCallback(
    (geometry?: Geometry) => {
      if (geometry == null) return;
      // geometry is in pixel coordinates from useEditGeometry
      // Convert it BACK to time/freq coordinates before sending to API
      const timeFreqGeometry = scaleGeometryFromWindow(geometry, window);
      onChange?.(timeFreqGeometry);
    },
    [onChange, window],
  );

  const handleOnCopy = useCallback(
    (geometry?: Geometry) => {
      if (geometry == null) return;
      // geometry is in pixel coordinates from useEditGeometry
      // Convert it BACK to time/freq coordinates before sending to API
      const timeFreqGeometry = scaleGeometryFromWindow(geometry, window);
      onCopy?.(timeFreqGeometry);
    },
    [onCopy, window],
  );

  const ret = useEditGeometry({
    object: scaledGeometry,
    enabled: enabled,
    style: style,
    onDrop: handleOnCopy,
    onChange: handleOnChange,
    onDeselect: onDeselect,
  });

  const reconstructed = useMemo(() => {
    if (ret.object === null) return null;
    // ret.object is in pixel coordinates, convert back to time/freq
    return scaleGeometryFromWindow(ret.object, window);
  }, [window, ret.object]);

  return {
    ...ret,
    geometry: reconstructed,
  };
}
