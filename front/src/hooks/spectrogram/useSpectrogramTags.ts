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
    let widthScaleFactor = 1;
    let heightScaleFactor = 1;
    let canvasWidth = SPECTROGRAM_CANVAS_DIMENSIONS.width;
    let canvasHeight = SPECTROGRAM_CANVAS_DIMENSIONS.height;
    
    if (canvasRef?.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      widthScaleFactor = rect.width / canvasWidth;
      heightScaleFactor = rect.height / canvasHeight;
      canvasWidth = rect.width;
      canvasHeight = rect.height;
    }

    return annotationsInWindow.map((annotation) => {
      const position = getLabelPosition(annotation, window);

      // Scale the position (offset is already applied in getLabelPosition)
      let scaledX = position.x * widthScaleFactor;
      let scaledY = position.y * heightScaleFactor;

      // Apply placement-aware clamping to prevent tags from overflowing
      // Tags need different margins depending on which direction they extend
      const TAG_MARGIN = 30; // Estimated max tag width/height in pixels
      const MIN_MARGIN = 10;  // Minimum margin from edges

      // Clamp X based on placement (tags extend in the placement direction)
      if (position.placement === "right") {
        // Tag extends to the right, so keep away from right edge
        scaledX = Math.min(scaledX, canvasWidth - TAG_MARGIN);
        scaledX = Math.max(scaledX, MIN_MARGIN);
      } else if (position.placement === "left") {
        // Tag extends to the left, so keep away from left edge
        scaledX = Math.max(scaledX, TAG_MARGIN);
        scaledX = Math.min(scaledX, canvasWidth - MIN_MARGIN);
      } else {
        // For top/bottom placements, center horizontally with margins
        scaledX = Math.max(MIN_MARGIN, Math.min(scaledX, canvasWidth - MIN_MARGIN));
      }

      // Clamp Y based on placement
      if (position.placement === "bottom") {
        // Tag extends downward, so keep away from bottom edge
        scaledY = Math.min(scaledY, canvasHeight - TAG_MARGIN);
        scaledY = Math.max(scaledY, MIN_MARGIN);
      } else if (position.placement === "top") {
        // Tag extends upward, so keep away from top edge
        scaledY = Math.max(scaledY, TAG_MARGIN);
        scaledY = Math.min(scaledY, canvasHeight - MIN_MARGIN);
      } else {
        // For left/right placements, keep Y within reasonable bounds
        scaledY = Math.max(MIN_MARGIN, Math.min(scaledY, canvasHeight - MIN_MARGIN));
      }

      const scaledPosition = {
        ...position,
        x: scaledX,
        y: scaledY,
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
