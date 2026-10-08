import { useMemo } from "react";
import classNames from "classnames";

import Button from "@/components/Button";
import { CloseIcon, NextIcon, PreviousIcon } from "@/components/icons";
import SoundEventAnnotationTags from "@/components/sound_event_annotations/SoundEventAnnotationTags";
import SoundEventAnnotationSpectrogramView from "@/components/sound_event_annotations/SoundEventAnnotationSpectrogram";
import useSoundEventAnnotation from "@/hooks/api/useSoundEventAnnotation";
import { formatPassLabel, getPassContext } from "@/utils/passes";

import type {
  AnnotationTask,
  SoundEventAnnotation,
  SpectrogramParameters,
  SpectrogramWindow,
  Tag,
} from "@/types";
import type { TagVisibilityFilter } from "@/utils/passes";

/** Fits inside overlay width (30rem card minus padding) without horizontal scroll */
const FULLSCREEN_EVENT_PREVIEW_DIMENSIONS = { width: 448, height: 224 };

function getConfidenceLabel(annotation: SoundEventAnnotation): string | null {
  const creatorUsername = annotation.created_by?.username;
  const features = annotation.features ?? [];
  const speciesFeatures = features.filter((f) =>
    f.name.startsWith("species_confidence"),
  );
  const detectionFeatures = features.filter((f) =>
    f.name.startsWith("detection_confidence"),
  );
  const chosen =
    creatorUsername === "birdedge" && speciesFeatures.length > 0
      ? speciesFeatures
      : detectionFeatures.length > 0
        ? detectionFeatures
        : speciesFeatures;
  if (chosen.length === 0) {
    return null;
  }
  return chosen.map((f) => f.value.toLocaleString()).join(", ");
}

export default function FullscreenSelectedSoundEventOverlay({
  soundEventAnnotation: data,
  annotationTask,
  allSoundEventAnnotations,
  tagVisibility,
  offsetForTagChip = false,
  onDeselect,
  onSelectSoundEventAnnotation,
  onRemoveTag,
  samplerate,
  parameters,
  withSpectrogram,
  getReferenceWindow,
  referenceWindow,
}: {
  soundEventAnnotation: SoundEventAnnotation;
  annotationTask: AnnotationTask;
  allSoundEventAnnotations: SoundEventAnnotation[];
  tagVisibility?: TagVisibilityFilter;
  offsetForTagChip?: boolean;
  onDeselect: () => void;
  onSelectSoundEventAnnotation?: (annotation: SoundEventAnnotation) => void;
  onRemoveTag?: (tag: Tag) => void | Promise<unknown>;
  samplerate: number;
  parameters: SpectrogramParameters;
  withSpectrogram: boolean;
  getReferenceWindow?: () => SpectrogramWindow | null;
  referenceWindow?: SpectrogramWindow | null;
}) {
  const soundEventQuery = useSoundEventAnnotation({
    id: data.id,
    annotationTask,
    includeCreatedBy: true,
    includeFeatures: true,
    includeTags: true,
  });

  const currentAnnotation = useMemo(
    () => soundEventQuery.data ?? data,
    [soundEventQuery.data, data],
  );

  const passContext = getPassContext(currentAnnotation, allSoundEventAnnotations);
  const confidence = getConfidenceLabel(currentAnnotation);
  const createdBy = currentAnnotation.created_by?.username;

  const previousEvent =
    passContext != null && passContext.index > 0
      ? passContext.events[passContext.index - 1]
      : null;
  const nextEvent =
    passContext != null && passContext.index < passContext.total - 1
      ? passContext.events[passContext.index + 1]
      : null;

  const effectiveSamplerate =
    parameters.resample && parameters.samplerate
      ? parameters.samplerate
      : samplerate;

  return (
    <div
      className={classNames(
        "pointer-events-auto absolute right-2 z-20 max-h-[min(90vh,32rem)] w-[min(30rem,92vw)] min-w-0 overflow-x-hidden overflow-y-auto rounded-md border border-stone-200 bg-stone-50/95 p-2 shadow-lg backdrop-blur-sm dark:border-stone-600 dark:bg-stone-900/95",
        offsetForTagChip ? "top-12" : "top-2",
      )}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-stone-700 dark:text-stone-200">
          Selected sound event
        </span>
        <Button mode="text" padding="p-0.5" variant="secondary" onClick={onDeselect}>
          <CloseIcon className="h-4 w-4" />
        </Button>
      </div>

      <div className="mb-2 min-w-0 max-w-full overflow-hidden">
        <SoundEventAnnotationSpectrogramView
          key={`fullscreen-event-${currentAnnotation.id}-${effectiveSamplerate}-${parameters.channel}-${parameters.mix_channels}`}
          embed
          embedControls
          canvasDimensions={FULLSCREEN_EVENT_PREVIEW_DIMENSIONS}
          soundEventAnnotation={currentAnnotation}
          task={annotationTask}
          samplerate={samplerate}
          parameters={parameters}
          withSpectrogram={withSpectrogram}
          getReferenceWindow={getReferenceWindow}
          referenceWindow={referenceWindow}
        />
      </div>

      {(confidence != null || createdBy != null) && (
        <p className="mb-1 text-xs text-stone-600 dark:text-stone-400">
          {confidence != null && <span>Confidence: {confidence}</span>}
          {confidence != null && createdBy != null && <span> · </span>}
          {createdBy != null && <span>By {createdBy}</span>}
        </p>
      )}

      {passContext != null && (
        <div className="mb-1 flex items-center justify-between gap-1 text-xs text-stone-600 dark:text-stone-400">
          <span className="min-w-0 truncate">
            Pass {formatPassLabel(passContext.passTag)} · {passContext.index + 1}/
            {passContext.total}
          </span>
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              mode="text"
              padding="p-0.5"
              variant="info"
              disabled={previousEvent == null}
              onClick={() =>
                previousEvent && onSelectSoundEventAnnotation?.(previousEvent)
              }
            >
              <PreviousIcon className="h-4 w-4" />
            </Button>
            <Button
              mode="text"
              padding="p-0.5"
              variant="info"
              disabled={nextEvent == null}
              onClick={() => nextEvent && onSelectSoundEventAnnotation?.(nextEvent)}
            >
              <NextIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <div className="min-w-0 max-w-full">
      <SoundEventAnnotationTags
        compact
        showAddButton={false}
        soundEventAnnotation={currentAnnotation}
        tagVisibility={tagVisibility}
        onRemoveTag={
          onRemoveTag ??
          ((tag) => {
              void soundEventQuery.removeTag.mutateAsync(tag);
            })
        }
      />
      </div>
    </div>
  );
}
