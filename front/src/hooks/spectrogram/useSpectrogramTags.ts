import { useMemo } from "react";

import { isGeometryInWindow } from "@/utils/geometry";
import { getLabelPosition } from "@/utils/tags";
import { SPECTROGRAM_CANVAS_DIMENSIONS } from "@/constants";

import type { TagElement, TagGroup } from "@/utils/tags";
import type {
  SoundEventAnnotation,
  SpectrogramWindow,
  Tag,
} from "@/types";

export default function useSpectrogramTags({
  annotations,
  window,
  canvasRef,
  onClickTag,
  onAddTag,
  active = true,
  disabled = false,
}: {
  annotations: SoundEventAnnotation[];
  window: SpectrogramWindow;
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
  onClickTag?: (annotation: SoundEventAnnotation, tag: Tag) => void;
  onAddTag?: (annotation: SoundEventAnnotation, tag: Tag) => void;
  active?: boolean;
  disabled?: boolean;
}) {
  const annotationsInWindow = useMemo(() => {
    return annotations.filter((annotation) => {
      // @ts-ignore
      return isGeometryInWindow(annotation.geometry, window);
    });
  }, [annotations, window]);

  const groups: TagGroup[] = useMemo(() => {
    // Calculate scale factor from canvas dimensions
    let scaleFactor = 1;
    if (canvasRef?.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      scaleFactor = rect.width / SPECTROGRAM_CANVAS_DIMENSIONS.width;
    }

    return annotationsInWindow.map((annotation) => {
      const position = getLabelPosition(annotation, window);

      // Apply scaling factor to position
      const scaledPosition = {
        ...position,
        x: position.x * scaleFactor,
        y: position.y * scaleFactor,
      };

      const group: TagElement[] =
        annotation.tags?.map((tag) => {
          return {
            tag: tag,
            onClick: () => onClickTag?.(annotation, tag),
          };
        }) || [];

      return {
        tags: group,
        onAdd: (tag) => onAddTag?.(annotation, tag),
        position: scaledPosition,
        annotation,
        active,
        disabled,
      };
    });
  }, [
    annotationsInWindow,
    window,
    canvasRef,
    active,
    onClickTag,
    onAddTag,
    disabled,
  ]);

  return groups;
}
