import Card from "@/components/Card";
import PassContext from "@/components/annotation_tasks/PassContext";
import SoundEventAnnotationDetails from "@/components/sound_event_annotations/SoundEventAnnotationDetails";
import SoundEventAnnotationTags from "@/components/sound_event_annotations/SoundEventAnnotationTags";
import useSoundEventAnnotation from "@/hooks/api/useSoundEventAnnotation";
import SoundEventAnnotationSpectrogramView from "../sound_event_annotations/SoundEventAnnotationSpectrogram";
import { SpectrogramParameters } from "@/types";
import { useEffect, useMemo } from "react";

import type { TagFilter } from "@/api/tags";
import type { AnnotationTask, SoundEventAnnotation, Tag } from "@/types";
import type { TagVisibilityFilter } from "@/utils/passes";

export default function SelectedSoundEventAnnotation({
  soundEventAnnotation: data,
  annotationTask,
  samplerate,
  tagFilter,
  withSpectrogram,
  parameters,
  onUpdate,
  tagVisibility,
  onSelectSoundEventAnnotation,
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
  onUpdate?: (annotation: SoundEventAnnotation) => void;
  tagVisibility?: TagVisibilityFilter;
  onSelectSoundEventAnnotation?: (annotation: SoundEventAnnotation) => void;
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

  // Calculate effective samplerate for keying the spectrogram component
  // This forces a complete re-mount when resampling parameters change
  const effectiveSamplerate = useMemo(() => {
    return parameters.resample && parameters.samplerate
      ? parameters.samplerate
      : samplerate;
  }, [parameters.resample, parameters.samplerate, samplerate]);

  return (
    <div className="flex w-full min-w-0 max-w-full flex-col gap-4 py-4">
      <Card className="min-w-0 max-w-full grow">
        <SoundEventAnnotationSpectrogramView
          key={`spectrogram-${currentAnnotation.id}-${effectiveSamplerate}`}
          soundEventAnnotation={currentAnnotation}
          task={annotationTask}
          samplerate={samplerate}
          parameters={parameters}
          withSpectrogram={withSpectrogram}
        />
      </Card>
      <PassContext
        soundEventAnnotation={currentAnnotation}
        allSoundEventAnnotations={allSoundEventAnnotations}
        onSelectSoundEventAnnotation={onSelectSoundEventAnnotation}
      />
      <Card className="min-w-0 max-w-full grow">
        <div className="flex min-w-0 max-w-full gap-4">
          <div className="min-w-0 flex-1">
            <SoundEventAnnotationTags
              tagFilter={tagFilter}
              soundEventAnnotation={currentAnnotation}
              tagVisibility={tagVisibility}
              onAddTag={soundEventAnnotation.addTag.mutate}
              onRemoveTag={soundEventAnnotation.removeTag.mutate}
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
