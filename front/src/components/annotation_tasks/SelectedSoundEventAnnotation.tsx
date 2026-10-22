import Card from "@/components/Card";
import PassContext from "@/components/annotation_tasks/PassContext";
import SoundEventAnnotationDetails from "@/components/sound_event_annotations/SoundEventAnnotationDetails";
import SoundEventAnnotationTags from "@/components/sound_event_annotations/SoundEventAnnotationTags";
import useSoundEventAnnotation from "@/hooks/api/useSoundEventAnnotation";
import SoundEventAnnotationSpectrogramView from "../sound_event_annotations/SoundEventAnnotationSpectrogram";
import { SpectrogramParameters } from "@/types";
import { useEffect, useMemo } from "react";
import { useMeasure } from "react-use";
import { SOUND_EVENT_CANVAS_DIMENSIONS } from "@/constants";

/** Narrowest event spectrogram; below this the side column scrolls. */
const MIN_EVENT_CANVAS_WIDTH = 280;

import type { TagFilter } from "@/api/tags";
import type {
  AnnotationTask,
  SoundEventAnnotation,
  SpectrogramWindow,
  Tag,
} from "@/types";
import type { TagVisibilityFilter } from "@/utils/passes";

export default function SelectedSoundEventAnnotation({
  soundEventAnnotation: data,
  annotationTask,
  samplerate,
  tagFilter,
  withSpectrogram,
  parameters,
  getReferenceWindow,
  referenceWindow,
  onUpdate,
  tagVisibility,
  onSelectSoundEventAnnotation,
  onAddTag,
  onRemoveTag,
}: {
  //* The sound event annotation to display */
  soundEventAnnotation: SoundEventAnnotation;
  /** The annotation task to which the sound event annotation belongs */
  annotationTask: AnnotationTask;
  samplerate: number,
  /** The tag filter to apply in case more tags want to be added */
  tagFilter?: TagFilter;
  withSpectrogram: boolean;
  parameters: SpectrogramParameters;
  /** Current window of the main spectrogram, whose scale ratio this view copies */
  getReferenceWindow?: () => SpectrogramWindow | null;
  referenceWindow?: SpectrogramWindow | null;
  onUpdate?: (annotation: SoundEventAnnotation) => void;
  tagVisibility?: TagVisibilityFilter;
  onSelectSoundEventAnnotation?: (annotation: SoundEventAnnotation) => void;
  onAddTag?: (tag: Tag) => void | Promise<unknown>;
  onRemoveTag?: (tag: Tag) => void | Promise<unknown>;
}) {
  const soundEventAnnotation = useSoundEventAnnotation({
    id: data.id,
    annotationTask,
    includeCreatedBy: true,
    includeFeatures: true,
    includeTags: true,
    onUpdate,
  });

  // Use the sound event annotation data from the query (it's reactive to cache updates)
  // The query will automatically re-render when the cache is updated by mutations
  const currentAnnotation = useMemo(() => {
    return soundEventAnnotation.data || data;
  }, [soundEventAnnotation.data, data]);

  const allSoundEventAnnotations = useMemo(
    () => annotationTask.sound_event_annotations ?? [],
    [annotationTask.sound_event_annotations],
  );

  // Update parent component when annotation data changes
  useEffect(() => {
    if (currentAnnotation && onUpdate && currentAnnotation !== data) {
      onUpdate(currentAnnotation);
    }
  }, [currentAnnotation, onUpdate, data]);

  // Remount when resampling or channel settings change so the spectrogram reloads.
  const effectiveSamplerate = useMemo(() => {
    return parameters.resample && parameters.samplerate
      ? parameters.samplerate
      : samplerate;
  }, [parameters.resample, parameters.samplerate, samplerate]);

  // Fit the event spectrogram to the side column. Its drawing and hit testing
  // work in these CSS pixels, so a smaller canvas (same aspect ratio) keeps
  // the pointer mapping exact, unlike scaling a fixed-size canvas.
  const [panelRef, panel] = useMeasure<HTMLDivElement>();
  const canvasDimensions = useMemo(() => {
    if (panel.width <= 0) return undefined;
    const { width: maxWidth, height: maxHeight } = SOUND_EVENT_CANVAS_DIMENSIONS;
    const width = Math.max(MIN_EVENT_CANVAS_WIDTH, Math.min(maxWidth, Math.floor(panel.width)));
    if (width === maxWidth) return undefined;
    return { width, height: Math.round((width * maxHeight) / maxWidth) };
  }, [panel.width]);

  return (
    <div className="flex w-full min-w-0 max-w-full flex-col gap-3">
      <Card className="min-w-0 max-w-full grow">
        <div ref={panelRef} className="w-full min-w-0">
        <SoundEventAnnotationSpectrogramView
          canvasDimensions={canvasDimensions}
          key={`spectrogram-${currentAnnotation.id}-${effectiveSamplerate}-${parameters.channel}-${parameters.mix_channels}`}
          soundEventAnnotation={currentAnnotation}
          task={annotationTask}
          samplerate={samplerate}
          parameters={parameters}
          withSpectrogram={withSpectrogram}
          getReferenceWindow={getReferenceWindow}
          referenceWindow={referenceWindow}
        />
        </div>
      </Card>
      <PassContext
        soundEventAnnotation={currentAnnotation}
        allSoundEventAnnotations={allSoundEventAnnotations}
        onSelectSoundEventAnnotation={onSelectSoundEventAnnotation}
      />
      {/* Tags and details side by side only when the panel itself is wide. */}
      <Card className="@container min-w-0 max-w-full grow">
        <div className="flex min-w-0 max-w-full flex-col gap-4 @lg:flex-row">
          <div className="min-w-0 flex-1">
            <SoundEventAnnotationTags
              tagFilter={tagFilter}
              soundEventAnnotation={currentAnnotation}
              tagVisibility={tagVisibility}
              onAddTag={
                onAddTag ??
                ((tag) => {
                  void soundEventAnnotation.addTag.mutateAsync(tag);
                })
              }
              onRemoveTag={
                onRemoveTag ??
                ((tag) => {
                  void soundEventAnnotation.removeTag.mutateAsync(tag);
                })
              }
            />
          </div>
          <div className="min-w-0 flex-1">
            <SoundEventAnnotationDetails
              soundEventAnnotation={currentAnnotation}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
