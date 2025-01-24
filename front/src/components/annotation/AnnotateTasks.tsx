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
import RecordingTagBar from "../recordings/RecordingTagBar";

import { Popover } from "@headlessui/react";
import SearchMenu from "@/components/search/SearchMenu";
import TagComponent, { getTagKey } from "@/components/tags/Tag";

import { SOUND_EVENT_CYCLE_FILTER_SHORTCUT, DELETE_TAG_SHORTCUT, ABORT_SHORTCUT } from "@/utils/keyboard";

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
  const [selectedAnnotation, setSelectedAnnotation] = useState<SoundEventAnnotation | null>(null);
  const [tagPalette, setTagPalette] = useState<Tag[]>([]);
  const [selectedTag, setSelectedTag] = useState<{ tag: Tag; count: number } | null>(null);


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
  const [isTagPopoverOpen, setIsTagPopoverOpen] = useState(false);

  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key === ABORT_SHORTCUT) {
        setIsDeletePopoverOpen(false);
        setIsTagPopoverOpen(false);
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        return;
      }

      if (
        event.key === DELETE_TAG_SHORTCUT &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault();
        setIsDeletePopoverOpen(true);
      }

      if (
        event.key === SOUND_EVENT_CYCLE_FILTER_SHORTCUT &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault();
        if (selectedTag) {
          setSelectedTag(null);
        } else {
          setIsTagPopoverOpen(true);
        }
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [setIsTagPopoverOpen, setIsDeletePopoverOpen, selectedTag, setSelectedTag]);


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
        if (selectedAnnotation) {
          // If an annotation is selected, only remove tag from it
          await removeTagFromSoundEvent.mutateAsync({
            soundEventAnnotation: selectedAnnotation,
            tag: tagWithCount.tag
          });
        } else {
          // Otherwise, remove from all sound events
          await handleRemoveTagFromSoundEvents(tagWithCount.tag);
        }
      }
      setIsDeletePopoverOpen(false);
    },
    [handleRemoveTagFromSoundEvents, removeTagFromSoundEvent, selectedAnnotation]
  );

  const handleAddTagToPalette = useCallback((tag: Tag) => {
    setTagPalette((tags) => {
      if (tags.some((t) => t.key === tag.key && t.value === tag.value)) {
        return tags;
      }
      return [...tags, tag];
    });
  }, []);

  const handleReplaceTagInSoundEvents = useCallback(
    async (oldTag: Tag | null, newTag: Tag | null, selectedAnnotation?: SoundEventAnnotation | null) => {
      if (!data?.sound_events) return;

      let soundEventsToUpdate: SoundEventAnnotation[] = [];
      if (selectedAnnotation) {
        soundEventsToUpdate = [selectedAnnotation];
      } else {
        // If no specific annotation is selected, handle all sound events
        if (oldTag?.key === "all") {
          // If "all tags" is selected, get sound events that have any tags
          soundEventsToUpdate = data.sound_events.filter(soundEvent =>
            soundEvent.tags && soundEvent.tags.length > 0
          );
        } else if (oldTag) {
          // If a specific tag is selected, get sound events with that tag
          soundEventsToUpdate = data.sound_events.filter(soundEvent =>
            soundEvent.tags?.some(
              tag => tag.key === oldTag.key && tag.value === oldTag.value
            )
          );
        } else {
          // Otherwise, update all sound events
          soundEventsToUpdate = data.sound_events;
        }
      }

      const promises = soundEventsToUpdate.map(async soundEvent => {
        try {
          // If replacing all tags, remove all existing tags first
          if (oldTag?.key === "all" && soundEvent.tags) {
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
    <div className="w-full flex flex-col gap-4">
      <div className="flex flex-row gap-4">
        <div className="min-w-[63rem]">
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
      <div className="flex flex-col gap-4">
        <div className="flex flex-row gap-4">
          <div className="min-w-[63rem]">
            {isLoadingClipAnnotation ? (
              <Loading />
            ) : data == null ? (
              <NoClipSelected />
            ) : (
              <div className="flex flex-col gap-2">
                <RecordingAnnotationContext
                  recording={data.clip.recording}
                />
                <div className="min-w-0 grow-0">
                  <ClipAnnotationSpectrogram
                    parameters={parameters}
                    clipAnnotation={data}
                    defaultTags={tagPalette}
                    selectedTag={selectedTag}
                    onClearSelectedTag={setSelectedTag}
                    onParameterSave={onParameterSave}
                    selectedAnnotation={selectedAnnotation}
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
              </div>
            )}
          </div>

          {selectedAnnotation == null || data == null ? (
            <div className="w-[35rem] flex-none mt-9">
              <Empty
                padding="p-0">
                No sound event selected. Select a sound event to view details.
              </Empty>
            </div>
          ) : (
            <div className="w-[35rem] flex-none mt-5">
              <SelectedSoundEventAnnotation
                clipAnnotation={data}
                tagFilter={tagFilter}
                soundEventAnnotation={selectedAnnotation}
                parameters={parameters}
                withSpectrogram={withSpectrogram}
                onAddTag={onAddSoundEventTag}
                onCreateTag={onCreateTag}
                onRemoveTag={onRemoveSoundEventTag}
              />
            </div>
          )}
        </div>


        {data && (
          <div className="flex flex-row gap-4 w-full">
            <div className="min-w-[63rem] flex flex-col gap-4">
              <RecordingTagBar
                recording={data.clip.recording}
              />
              <ClipAnnotationNotes
                onCreateNote={addNote.mutate}
                onDeleteNote={removeNote.mutate}
                clipAnnotation={data}
                currentUser={currentUser}
              />
            </div>
            <div className="min-w-[35rem]">
              <ClipAnnotationTags
                clipAnnotation={data}
                projectTags={projectTags}
                onReplaceTagInSoundEvents={handleReplaceTagInSoundEvents}
                selectedAnnotation={selectedAnnotation}
              />
            </div>
          </div>
        )}
      </div>

      {isDeletePopoverOpen && (
        <Popover>
          {({ open, close }) => {

            const handleOverlayClick = (e: React.MouseEvent) => {
              // Check if click is inside menu
              if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setIsDeletePopoverOpen(false);
              }
            };

            return (
              <>
                <Popover.Button className="hidden" />
                <Popover.Panel static={true} className="fixed inset-0 z-50">
                  <div className="fixed inset-0 flex items-center justify-center" onClick={handleOverlayClick}>
                    <div ref={menuRef} className="relative w-96 divide-y divide-stone-100 rounded-md bg-stone-50 dark:bg-stone-700 border border-stone-200 dark:border-stone-500 shadow-md dark:shadow-stone-800 ring-1 ring-stone-900 ring-opacity-5 focus:outline-none">
                      <div className="p-4">
                        <div className="mb-2 text-stone-700 dark:text-stone-300 underline underline-offset-2 decoration-amber-500 decoration-2">
                          Select a tag to remove from {selectedAnnotation ? 'selected sound event' : 'all sound events'}
                        </div>
                        <SearchMenu
                          limit={100}
                          options={selectedAnnotation
                            ? (selectedAnnotation.tags || []).map(tag => ({ tag, count: 1 }))
                            : tagsWithCount}
                          fields={["tag.key", "tag.value"]}
                          renderOption={(tagWithCount) => (
                            <TagComponent
                              key={getTagKey(tagWithCount.tag)}
                              tag={tagWithCount.tag}
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

      {isTagPopoverOpen && (
        <Popover>
          {({ open, close }) => {

            const handleOverlayClick = (e: React.MouseEvent) => {
              // Check if click is inside menu
              if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setIsTagPopoverOpen(false);
              }
            };

            return (
              <>
                <Popover.Button className="hidden" />
                <Popover.Panel static={true} className="fixed inset-0 z-50">
                  <div className="fixed inset-0 flex items-center justify-center" onClick={handleOverlayClick}>
                    <div ref={menuRef} className="relative w-96 divide-y divide-stone-100 rounded-md bg-stone-50 dark:bg-stone-700 border border-stone-200 dark:border-stone-500 shadow-md dark:shadow-stone-800 ring-1 ring-stone-900 ring-opacity-5 focus:outline-none">
                      <div className="p-4">
                        <div className="mb-2 text-stone-700 dark:text-stone-300 underline underline-offset-2 decoration-amber-500 decoration-2">
                          Select a tag to cycle through
                        </div>
                        <SearchMenu
                          limit={100}
                          options={tagsWithCount}
                          fields={["tag.key", "tag.value"]}
                          renderOption={(tagWithCount) => (
                            <TagComponent
                              key={getTagKey(tagWithCount.tag)}
                              tag={tagWithCount.tag}
                              onClose={() => { }}
                              count={tagWithCount.count}
                            />
                          )}
                          getOptionKey={(tagWithCount) => `${tagWithCount.tag.key}-${tagWithCount.tag.value}`}
                          onSelect={(tagWithCount) => {
                            if (menuRef.current?.contains(document.activeElement)) {
                              setSelectedTag(tagWithCount)
                              setIsTagPopoverOpen(false);
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
