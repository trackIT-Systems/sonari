import Card from "@/components/Card";
import SoundEventAnnotationDetails from "@/components/sound_event_annotations/SoundEventAnnotationDetails";
import SoundEventAnnotationTags from "@/components/sound_event_annotations/SoundEventAnnotationTags";
import useSoundEventAnnotation from "@/hooks/api/useSoundEventAnnotation";
import SoundEventSpectrogramView from "../sound_event_annotations/SoundEventSpectrogram";
import { SpectrogramParameters } from "@/types";
import { useEffect, useMemo } from "react";

import type { TagFilter } from "@/api/tags";
import type { ClipAnnotation, SoundEventAnnotation, Tag } from "@/types";

export default function SelectedSoundEventAnnotation({
  soundEventAnnotation: data,
  clipAnnotation,
  tagFilter,
  withSpectrogram,
  parameters,
  onAddTag,
  onRemoveTag,
  onCreateTag,
  onUpdate,
}: {
  //* The sound event annotation to display */
  soundEventAnnotation: SoundEventAnnotation;
  /** The clip annotation to which the sound event annotation belongs */
  clipAnnotation: ClipAnnotation;
  /** The tag filter to apply in case more tags want to be added */
  tagFilter?: TagFilter;
  withSpectrogram: boolean;
  parameters?: SpectrogramParameters;
  onAddTag?: (annotation: SoundEventAnnotation) => void;
  onRemoveTag?: (annotation: SoundEventAnnotation) => void;
  onCreateTag?: (tag: Tag) => void;
  onUpdate?: (annotation: SoundEventAnnotation) => void;
}) {
  const soundEventAnnotation = useSoundEventAnnotation({
    uuid: data.uuid,
    clipAnnotation,
    soundEventAnnotation: data,
    onAddTag,
    onRemoveTag,
    onUpdate,
  });

  // Find the current annotation in the clip's sound events (this is reactive to cache changes)
  const annotationFromClip = useMemo(() => {
    return clipAnnotation.sound_events?.find(annotation => annotation.uuid === data.uuid);
  }, [clipAnnotation.sound_events, data.uuid]);

  // Use the clip annotation data if available (reactive), otherwise use hook or prop data
  const currentAnnotation = useMemo(() => {
    return annotationFromClip || soundEventAnnotation.data || data;
  }, [annotationFromClip, soundEventAnnotation.data, data]);

  // Update parent component when annotation data changes
  useEffect(() => {
    if (currentAnnotation && onUpdate && currentAnnotation !== data) {
      onUpdate(currentAnnotation);
    }
  }, [currentAnnotation, onUpdate, data]);

  return (
    <div className="w-full flex flex-col gap-4 py-4">
      <Card className="grow">
        <SoundEventSpectrogramView
          soundEventAnnotation={currentAnnotation}
          recording={clipAnnotation.clip.recording}
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
              onCreateTag={onCreateTag}
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