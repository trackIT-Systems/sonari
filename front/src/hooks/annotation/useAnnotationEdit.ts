import { useCallback } from "react";

import useEditAnnotationGeometry from "@/hooks/edit/useEditAnnotation";

import type {
  Dimensions,
  Geometry,
  SoundEventAnnotation,
  SpectrogramWindow,
} from "@/types";

const PRIMARY = "rgb(16 185 129)";

const EDIT_STYLE = {
  borderColor: PRIMARY,
  fillColor: PRIMARY,
  borderWidth: 2,
  borderDash: [6, 6],
  fillAlpha: 0.2,
};

export default function useAnnotationEdit({
  window,
  annotation,
  enabled = true,
  onEdit,
  onCopy,
  onDeselect,
}: {
  window: SpectrogramWindow;
  annotation: SoundEventAnnotation | null;
  enabled?: boolean;
  onEdit?: (geometry: Geometry) => void;
  onCopy?: (annotation: SoundEventAnnotation, geometry: Geometry) => void;
  onDeselect?: () => void;
}) {
  const handleCopy = useCallback(
    (geometry: Geometry) => {
      if (annotation !== null) {
        onCopy?.(annotation, geometry);
      }
    },
    [annotation, onCopy],
  );

  const { draw, props } = useEditAnnotationGeometry({
    window,
    soundEventAnnotation: annotation,
    enabled,
    onChange: onEdit,
    onCopy: handleCopy,
    onDeselect,
    style: EDIT_STYLE,
  });

  return {
    draw,
    props,
  };
}
