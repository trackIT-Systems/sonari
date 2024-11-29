import { useCallback, useState, useMemo, useEffect, useRef } from "react";

import { DEFAULT_SPECTROGRAM_PARAMETERS } from "@/api/spectrograms";
import AnnotationProgress from "@/components/annotation/AnnotationProgress";
import RecordingAnnotationContext from "@/components/annotation/RecordingAnnotationContext";
import SelectedSoundEventAnnotation from "@/components/annotation/SelectedSoundEventAnnotation";
import AnnotationTaskStatus from "@/components/annotation_tasks/AnnotationTaskStatus";
import ClipAnnotationNotes from "@/components/clip_annotations/ClipAnnotationNotes";
import ClipAnnotationSpectrogram from "@/components/clip_annotations/ClipAnnotationSpectrogram";
import ClipAnnotationTags from "@/components/clip_annotations/ClipAnnotationTags";
import Empty from "@/components/Empty";
import Loading from "@/components/Loading";
import useAnnotationTasks from "@/hooks/annotation/useAnnotateTasks";
import useClipAnnotation from "@/hooks/api/useClipAnnotation";

import useStore from "@/store";
import { Popover } from "@headlessui/react";
import SearchMenu from "@/components/search/SearchMenu";
import TagComponent from "@/components/tags/Tag";

import type { AnnotationTaskFilter } from "@/api/annotation_tasks";
import type { TagFilter } from "@/api/tags";
import type {
  AnnotationTask,
  ClipAnnotation,
  SoundEventAnnotation,
  SpectrogramParameters,
  Tag,
  User,
} from "@/types";

export default function AnnotateTasks({
  taskFilter,
  tagFilter,
  projectTags,
  parameters = DEFAULT_SPECTROGRAM_PARAMETERS,
  annotationTask,
  currentUser,
  instructions,
  onCreateTag,
  onCreateSoundEventAnnotation,
  onUpdateSoundEventAnnotation,
  onAddSoundEventTag,
  onRemoveSoundEventTag,
  onDeleteSoundEventAnnotation,
  onChangeTask,
  onAddClipTag,
  onRemoveClipTag,
  onParameterSave,
  onCompleteTask,
  onUnsureTask,
  onRejectTask,
  onVerifyTask,
}: {
  instructions: string;
  /** Filter to select which tasks are to be annotated */
  taskFilter?: AnnotationTaskFilter;
  /** Filter to select which tags are to be used for annotation */
  tagFilter?: TagFilter;
  /** All tags available in that annotation project */
  projectTags: Tag[],
  /** Parameters to use for spectrogram rendering */
  parameters?: SpectrogramParameters;
  /** An optional annotation task to use initially */
  annotationTask?: AnnotationTask;
  /** The user who is annotating */
  currentUser: User;
  onCreateTag?: (tag: Tag) => void;
  onCreateSoundEventAnnotation?: (annotation: SoundEventAnnotation) => void;
  onUpdateSoundEventAnnotation?: (annotation: SoundEventAnnotation) => void;
  onAddSoundEventTag?: (annotation: SoundEventAnnotation) => void;
  onRemoveSoundEventTag?: (annotation: SoundEventAnnotation) => void;
  onDeleteSoundEventAnnotation?: (annotation: SoundEventAnnotation) => void;
  onChangeTask?: (annotationTask: AnnotationTask) => void;
  onAddClipTag?: (annotation: ClipAnnotation) => void;
  onRemoveClipTag?: (annotation: ClipAnnotation) => void;
  onAddStatusBadge?: (task: AnnotationTask) => void;
  onRemoveStatusBadge?: (task: AnnotationTask) => void;
  onParameterSave?: (parameters: SpectrogramParameters) => void;
  onCompleteTask?: () => void;
  onUnsureTask?: () => void;
  onRejectTask?: () => void;
  onVerifyTask?: () => void;
}) {
  const [selectedAnnotation, setSelectedAnnotation] =
    useState<SoundEventAnnotation | null>(null);
  const [tagPalette, setTagPalette] = useState<Tag[]>([]);


  const [withSpectrogram, setWithSpectrogram] = useState(true);
  const onWithSpectrogramChange = useCallback(
    () => {
      setWithSpectrogram(!withSpectrogram);
    },
    [withSpectrogram]
  )

  const [withAutoplay, setWithAutoplay] = useState(false);
  const onWithAutoplayChange = useCallback(
    () => {
      setWithAutoplay(!withAutoplay);
    },
    [withAutoplay]
  )

  const [fixedAspectRatio, setFixedAspectRatio] = useState(false);
  const toggleFixedAspectRatio = useCallback(() => {
    setFixedAspectRatio(prev => !prev);
  }, []);

  const tasks = useAnnotationTasks({
    filter: taskFilter,
    annotationTask: annotationTask,
    onChangeTask,
    onCompleteTask,
    onUnsureTask,
    onRejectTask,
    onVerifyTask,
  });

  const { data: clipAnnotation, isLoading: isLoadingClipAnnotation } =
    tasks.annotations;

  const { data, addNote, removeNote, removeTagFromSoundEvent, addTagToSoundEvent } = useClipAnnotation({
    uuid: clipAnnotation?.uuid,
    clipAnnotation,
    onAddTag: onAddClipTag,
    onRemoveTag: onRemoveClipTag,
    enabled: clipAnnotation != null,
  });

  const handleRemoveTagFromSoundEvents = useCallback(
    async (tagToRemove: Tag) => {
      if (!data?.sound_events) return;

      // For each sound event that has this tag
      const promises = data.sound_events
        .filter(soundEvent =>
          soundEvent.tags?.some(
            tag => tag.key === tagToRemove.key && tag.value === tagToRemove.value
          )
        )
        .map(soundEvent => {
          return removeTagFromSoundEvent.mutateAsync({
            soundEventAnnotation: soundEvent,
            tag: tagToRemove
          });
        });

      await Promise.all(promises);
    },
    [data?.sound_events, removeTagFromSoundEvent]
  );


  const [isDeletePopoverOpen, setIsDeletePopoverOpen] = useState(false);

  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDeletePopoverOpen(false);
        return;
      }

      if (
        event.key === 'y' &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault();
        setIsDeletePopoverOpen(true);
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const popoverElement = document.querySelector('[role="dialog"]');
      if (
        popoverElement &&
        !popoverElement.contains(event.target as Node) &&
        isDeletePopoverOpen
      ) {
        setIsDeletePopoverOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDeletePopoverOpen]);

  const tagsWithCount = useMemo(() => {
    if (!data?.sound_events) return [];

    const allTags = data.sound_events.flatMap(event => event.tags || []);
    const tagCounts = new Map<string, { tag: Tag; count: number }>();

    allTags.forEach(tag => {
      const key = `${tag.key}-${tag.value}`;
      const existing = tagCounts.get(key);
      if (existing) {
        existing.count++;
      } else {
        tagCounts.set(key, { tag, count: 1 });
      }
    });

    return Array.from(tagCounts.values());
  }, [data?.sound_events]);

  const handleDeleteTagFromAll = useCallback(
    async (tagWithCount: { tag: Tag; count: number }, shouldDelete: boolean) => {
      if (shouldDelete) {
        await handleRemoveTagFromSoundEvents(tagWithCount.tag);
      }
      setIsDeletePopoverOpen(false);
    },
    [handleRemoveTagFromSoundEvents]
  );

  const handleAddTagToPalette = useCallback((tag: Tag) => {
    setTagPalette((tags) => {
      if (tags.some((t) => t.key === tag.key && t.value === tag.value)) {
        return tags;
      }
      return [...tags, tag];
    });
  }, []);


  const getTagColor = useStore((state) => state.getTagColor);

  const handleReplaceTagInSoundEvents = useCallback(
    async (oldTag: Tag | null, newTag: Tag | null) => {
      if (!data?.sound_events) return;

      // Get all sound events that need updating
      const soundEventsToUpdate = oldTag === null
        ? data.sound_events.filter(soundEvent =>
          soundEvent.tags && soundEvent.tags.length > 0
        ) // If oldTag is null (all tags), get only sound events that have tags
        : data.sound_events.filter(soundEvent =>
          soundEvent.tags?.some(
            tag => tag.key === oldTag.key && tag.value === oldTag.value
          )
        );

      const promises = soundEventsToUpdate.map(async soundEvent => {
        try {
          // If replacing all tags, remove all existing tags first
          if (oldTag === null && soundEvent.tags) {
            for (const tag of soundEvent.tags) {
              await removeTagFromSoundEvent.mutateAsync({
                soundEventAnnotation: soundEvent,
                tag
              });
            }
          } else if (oldTag) {
            // Remove specific old tag
            await removeTagFromSoundEvent.mutateAsync({
              soundEventAnnotation: soundEvent,
              tag: oldTag
            });
          }

          // Add new tag
          if (newTag) {
            await addTagToSoundEvent.mutateAsync({
              soundEventAnnotation: soundEvent,
              tag: newTag
            });
          }
        } catch (error) {
          console.error('Error replacing tag:', error);
        }
      });

      await Promise.all(promises);
    },
    [data?.sound_events, removeTagFromSoundEvent, addTagToSoundEvent]
  );

  const menuRef = useRef<HTMLDivElement>(null);

  if (tasks.isLoading) {
    return <Loading />;
  }

  if (tasks.isError) {
    return <div>Error loading annotation tasks</div>;
  }

  if (tasks.task == null) {
    return <Empty>No tasks available</Empty>;
  }

  return (
    <div className="w-full flex flex-col gap-3">
      <div className="flex flex-row justify-between gap-8">
        <div className="grow min-w-[1000px]">
          <AnnotationProgress
            current={tasks.current}
            instructions={instructions}
            tasks={tasks.tasks}
            filter={tasks._filter}
            onNext={tasks.nextTask}
            onPrevious={tasks.prevTask}
          />
        </div>
        <div className="w-[35rem] flex-none">
          {tasks.task != null && (
            <AnnotationTaskStatus
              task={tasks.task}
              onReview={tasks.markRejected.mutate}
              onDone={tasks.markCompleted.mutate}
              onUnsure={tasks.markUnsure.mutate}
              onVerify={tasks.markVerified.mutate}
              onRemoveBadge={(state, userId) => tasks.removeBadge.mutate({ state, userId })}
            />
          )}
        </div>
      </div>
      <div className="flex flex-row justify-between gap-8">
        <div className="grow min-w-[1000px] gap-2">
          {isLoadingClipAnnotation ? (
            <Loading />
          ) : data == null ? (
            <NoClipSelected />
          ) : (
            <>
              <RecordingAnnotationContext
                recording={data.clip.recording}
                onTagClick={handleAddTagToPalette}
              />
              <div className="min-w-0">
                <ClipAnnotationSpectrogram
                  parameters={parameters}
                  clipAnnotation={data}
                  defaultTags={tagPalette}
                  onParameterSave={onParameterSave}
                  onSelectAnnotation={setSelectedAnnotation}
                  tagFilter={tagFilter}
                  withSpectrogram={withSpectrogram}
                  onWithSpectrogramChange={onWithSpectrogramChange}
                  withAutoplay={withAutoplay}
                  onWithAutoplayChange={onWithAutoplayChange}
                  fixedAspectRatio={fixedAspectRatio}
                  toggleFixedAspectRatio={toggleFixedAspectRatio}
                  onCreateTag={onCreateTag}
                  onAddSoundEventTag={onAddSoundEventTag}
                  onRemoveSoundEventTag={onRemoveSoundEventTag}
                  onCreateSoundEventAnnotation={onCreateSoundEventAnnotation}
                  onUpdateSoundEventAnnotation={onUpdateSoundEventAnnotation}
                  onDeleteSoundEventAnnotation={onDeleteSoundEventAnnotation}
                />
              </div>
              {selectedAnnotation == null ? (
                <Empty>
                  No sound event selected. Select a sound event to view details.
                </Empty>
              ) : (
                <div className="min-w-0">
                  <SelectedSoundEventAnnotation
                    clipAnnotation={data}
                    tagFilter={tagFilter}
                    soundEventAnnotation={selectedAnnotation}
                    onAddTag={onAddSoundEventTag}
                    onCreateTag={onCreateTag}
                    onRemoveTag={onRemoveSoundEventTag}
                  />
                </div>
              )}
            </>
          )}
        </div>
        <div className="w-[35rem] flex-none flex flex-col gap-4">
          <ClipAnnotationTags
            clipAnnotation={data}
            projectTags={projectTags}
            onReplaceTagInSoundEvents={handleReplaceTagInSoundEvents}
          />
          <ClipAnnotationNotes
            onCreateNote={addNote.mutate}
            onDeleteNote={removeNote.mutate}
            clipAnnotation={data}
            currentUser={currentUser}
          />
        </div>
      </div>

      {isDeletePopoverOpen && (
        <Popover>
          {({ open, close }) => {

            const handleOverlayClick = (e: React.MouseEvent) => {
              // Check if click is inside menu
              if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setIsDeletePopoverOpen(false);
                e.stopPropagation();
              }
            };

            return (
              <>
                <Popover.Button className="hidden" />
                <Popover.Panel
                  static={true}
                  className="fixed inset-0 z-50"
                >
                  <div
                    className="fixed inset-0 flex items-center justify-center"
                    onClick={handleOverlayClick}
                  >
                    <div
                      ref={menuRef}
                      className="relative w-96 divide-y divide-stone-100 rounded-md bg-stone-50 dark:bg-stone-700 border border-stone-200 dark:border-stone-500 shadow-md dark:shadow-stone-800 ring-1 ring-stone-900 ring-opacity-5 focus:outline-none"
                    >

                      <div className="p-4">
                        <div className="mb-2 text-stone-700 dark:text-stone-300 underline underline-offset-2 decoration-amber-500 decoration-2">
                          Select a tag to remove from all sound events
                        </div>
                        <SearchMenu
                          options={tagsWithCount}
                          fields={["tag.key", "tag.value"]}
                          renderOption={(tagWithCount) => (
                            <TagComponent
                              key={`${tagWithCount.tag.key}-${tagWithCount.tag.value}`}
                              tag={tagWithCount.tag}
                              {...getTagColor(tagWithCount.tag)}
                              onClose={() => { }}
                              count={tagWithCount.count}
                            />
                          )}
                          getOptionKey={(tagWithCount) => `${tagWithCount.tag.key}-${tagWithCount.tag.value}`}
                          onSelect={(tagWithCount) => {
                            if (menuRef.current?.contains(document.activeElement)) {
                              handleDeleteTagFromAll(tagWithCount, true);
                            }
                          }}
                          empty={<div className="text-stone-500 text-center w-full">No tags found</div>}
                          autoFocus
                          static={true}
                        />
                      </div>
                    </div>
                  </div>
                </Popover.Panel>
              </>
            );
          }}
        </Popover>
      )}
    </div>
  );
}

function NoClipSelected() {
  return <Empty>No clip selected</Empty>;
}
