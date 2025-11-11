import Card from "@/components/Card";
import SoundEventAnnotationDetails from "@/components/sound_event_annotations/SoundEventAnnotationDetails";
import SoundEventAnnotationTags from "@/components/sound_event_annotations/SoundEventAnnotationTags";
import useSoundEventAnnotation from "@/hooks/api/useSoundEventAnnotation";
import SoundEventAnnotationSpectrogramView from "../sound_event_annotations/SoundEventAnnotationSpectrogram";
import { SpectrogramParameters } from "@/types";
import { useEffect, useMemo } from "react";

import type { TagFilter } from "@/api/tags";
import type { AnnotationTask, SoundEventAnnotation, Tag } from "@/types";

export default function SelectedSoundEventAnnotation({
  soundEventAnnotation: data,
  annotationTask,
  tagFilter,
  withSpectrogram,
  parameters,
  onUpdate,
}: {
  //* The sound event annotation to display */
  soundEventAnnotation: SoundEventAnnotation;
  /** The annotation task to which the sound event annotation belongs */
  annotationTask: AnnotationTask;
  /** The tag filter to apply in case more tags want to be added */
  tagFilter?: TagFilter;
  withSpectrogram: boolean;
  parameters: SpectrogramParameters;
  onUpdate?: (annotation: SoundEventAnnotation) => void;
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

  // Update parent component when annotation data changes
  useEffect(() => {
    if (currentAnnotation && onUpdate && currentAnnotation !== data) {
      onUpdate(currentAnnotation);
    }
  }, [currentAnnotation, onUpdate, data]);

  return (
    <div className="w-full flex flex-col gap-4 py-4">
      <Card className="grow">
        <SoundEventAnnotationSpectrogramView
          soundEventAnnotation={currentAnnotation}
          recording={annotationTask.recording!}
          parameters={parameters}
          withSpectrogram={withSpectrogram}
        />
      </Card>
      <Card className="grow">
        <div className="flex gap-4">
          <div className="flex-1">
            <SoundEventAnnotationTags
              tagFilter={tagFilter}
              soundEventAnnotation={currentAnnotation}
              onAddTag={soundEventAnnotation.addTag.mutate}
              onRemoveTag={soundEventAnnotation.removeTag.mutate}
            />
          </div>
          <div className="flex-1">
            <SoundEventAnnotationDetails
              soundEventAnnotation={currentAnnotation}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}