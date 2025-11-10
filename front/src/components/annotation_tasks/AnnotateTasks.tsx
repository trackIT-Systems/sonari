import { useCallback, useState, useMemo, useEffect, useRef } from "react";

import { DEFAULT_SPECTROGRAM_PARAMETERS } from "@/api/spectrograms";
import AnnotationProgress from "@/components/annotation_tasks/AnnotationProgress";
import RecordingAnnotationContext from "@/components/annotation_tasks/RecordingAnnotationContext";
import SelectedSoundEventAnnotation from "@/components/annotation_tasks/SelectedSoundEventAnnotation";
import AnnotationTaskStatus from "@/components/annotation_tasks/AnnotationTaskStatus";
import AnnotationTaskSpectrogram from "@/components/annotation_tasks/AnnotationTaskSpectrogram";
import Empty from "@/components/Empty";
import Loading from "@/components/Loading";
import useAnnotationTasks from "@/hooks/annotation/useAnnotateTasks";
import type useAnnotationTask from "@/hooks/api/useAnnotationTask";
import RecordingTagBar from "../recordings/RecordingTagBar";

import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import SearchMenu from "@/components/search/SearchMenu";
import TagComponent, { getTagKey } from "@/components/tags/Tag";

import { SOUND_EVENT_CYCLE_FILTER_SHORTCUT, DELETE_TAG_SHORTCUT, ABORT_SHORTCUT } from "@/utils/keyboard";

import type { AnnotationTaskFilter } from "@/api/annotation_tasks";
import type { TagFilter } from "@/api/tags";
import type {
  AnnotationTask,
  SoundEventAnnotation,
  SpectrogramParameters,
  Tag,
  User,
} from "@/types";
import AnnotationTaskNotes from "./AnnotationTaskNotes";
import AnnotationTaskTags from "@/components/annotation_tasks/AnnotationTaskTags";

export default function AnnotateTasks({
  taskFilter,
  parameters = DEFAULT_SPECTROGRAM_PARAMETERS,
  annotationTaskProps,
  currentUser,
  onChangeTask,
  onParameterSave,
  onCompleteTask,
  onUnsureTask,
  onRejectTask,
  onVerifyTask,
}: {
  /** Filter to select which tasks are to be annotated */
  taskFilter?: AnnotationTaskFilter;
  /** Parameters to use for spectrogram rendering */
  parameters?: SpectrogramParameters;
  /** An optional annotation task to use initially */
  annotationTaskProps: ReturnType<typeof useAnnotationTask>;
  /** The user who is annotating */
  currentUser: User;
  onChangeTask?: (annotationTask: AnnotationTask) => void;
  onAddStatusBadge?: (task: AnnotationTask) => void;
  onRemoveStatusBadge?: (task: AnnotationTask) => void;
  onParameterSave?: (parameters: SpectrogramParameters) => void;
  onCompleteTask?: () => void;
  onUnsureTask?: () => void;
  onRejectTask?: () => void;
  onVerifyTask?: () => void;
}) {
  const [tagPalette, setTagPalette] = useState<Tag[]>([]);
  const [selectedTag, setSelectedTag] = useState<{ tag: Tag; count: number } | null>(null);
  
  const [selectedSoundEventAnnotation, setSelectedSoundEventAnnotation] = useState<SoundEventAnnotation | null>(null);
  const onDeselectSoundEventAnnotation = useCallback(() => {
    setSelectedSoundEventAnnotation(null);
  }, [setSelectedSoundEventAnnotation]);

  const onUpdateSelectedSoundEventAnnotation = useCallback((annotation: SoundEventAnnotation) => {
    setSelectedSoundEventAnnotation(annotation);
  }, []);

  const [withSpectrogram, setWithSpectrogram] = useState(true);
  const onWithSpectrogramChange = useCallback(
    () => {
      setWithSpectrogram(!withSpectrogram);
    },
    [withSpectrogram]
  )

  const [withSoundEvent, setWithSoundEvents] = useState(true);
  const onWithSoundEventChange = useCallback(
    () => {
      setWithSoundEvents(!withSoundEvent)
    },
    [withSoundEvent]
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

  const {data: annotationTask, addNote, removeNote, removeTagFromSoundEventAnnotation, addTagToSoundEventAnnotation} = annotationTaskProps

  const tasks = useAnnotationTasks({
    filter: taskFilter,
    annotationTask: annotationTask,
    onChangeTask,
    onCompleteTask,
    onUnsureTask,
    onRejectTask,
    onVerifyTask,
    onDeselectSoundEventAnnotation,
  });

  const handleRemoveTagFromSoundEventAnnotations = useCallback(
    async (tagToRemove: Tag) => {
      if (!annotationTask?.sound_event_annotations) return;
      // For each sound event annotation that has this tag
      const promises = annotationTask.sound_event_annotations
        .filter(soundEventAnnotation =>
          soundEventAnnotation.tags?.some(
            tag => tag.key === tagToRemove.key && tag.value === tagToRemove.value
          )
        )
        .map(soundEventAnnotation => {
          return removeTagFromSoundEventAnnotation.mutateAsync({
            soundEventAnnotation: soundEventAnnotation,
            tag: tagToRemove
          });
        });

      await Promise.all(promises);
    },
    [annotationTask?.sound_event_annotations, removeTagFromSoundEventAnnotation]
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
    if (!annotationTask?.sound_event_annotations) return [];

    const allTags = annotationTask.sound_event_annotations.flatMap(soundEventAnnotation => soundEventAnnotation.tags || []);
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
  }, [annotationTask?.sound_event_annotations]);

  const handleDeleteTagFromAll = useCallback(
    async (tagWithCount: { tag: Tag; count: number }, shouldDelete: boolean) => {
      if (shouldDelete) {
        if (selectedSoundEventAnnotation) {
          // If an annotation is selected, only remove tag from it
          await removeTagFromSoundEventAnnotation.mutateAsync({
            soundEventAnnotation: selectedSoundEventAnnotation,
            tag: tagWithCount.tag
          });
        } else {
          // Otherwise, remove from all sound event annotations
          await handleRemoveTagFromSoundEventAnnotations(tagWithCount.tag);
        }
      }
      setIsDeletePopoverOpen(false);
    },
    [handleRemoveTagFromSoundEventAnnotations, removeTagFromSoundEventAnnotation, selectedSoundEventAnnotation]
  );

  const handleAddTagToPalette = useCallback((tag: Tag) => {
    setTagPalette((tags) => {
      if (tags.some((t) => t.key === tag.key && t.value === tag.value)) {
        return tags;
      }
      return [...tags, tag];
    });
  }, []);

  const handleReplaceTagInSoundEventAnnotations = useCallback(
    async (oldTag: Tag | null, newTag: Tag | null, currentAnnotation?: SoundEventAnnotation | null) => {
      if (!annotationTask?.sound_event_annotations) return;

      let soundEventAnnotationsToUpdate: SoundEventAnnotation[] = [];
      if (currentAnnotation) {
        soundEventAnnotationsToUpdate = [currentAnnotation];
      } else {
        // If no specific annotation is selected, handle all sound event annotations
        if (oldTag?.key === "all") {
          // If "all tags" is selected, get sound event annotations that have any tags
          soundEventAnnotationsToUpdate = annotationTask.sound_event_annotations.filter(soundEventAnnotation =>
            soundEventAnnotation.tags && soundEventAnnotation.tags.length > 0
          );
        } else if (oldTag) {
          // If a specific tag is selected, get sound event annotations with that tag
          soundEventAnnotationsToUpdate = annotationTask.sound_event_annotations.filter(soundEventAnnotation =>
            soundEventAnnotation.tags?.some(
              tag => tag.key === oldTag.key && tag.value === oldTag.value
            )
          );
        } else {
          // Otherwise, update all sound event annotations
          soundEventAnnotationsToUpdate = annotationTask.sound_event_annotations;
        }
      }

      const promises = soundEventAnnotationsToUpdate.map(async soundEventAnnotation => {
        try {
          // If replacing all tags, remove all existing tags first
          if (oldTag?.key === "all" && soundEventAnnotation.tags) {
            for (const tag of soundEventAnnotation.tags) {
              await removeTagFromSoundEventAnnotation.mutateAsync({
                soundEventAnnotation: soundEventAnnotation,
                tag
              });
            }
          } else if (oldTag) {
            // Remove specific old tag
            await removeTagFromSoundEventAnnotation.mutateAsync({
              soundEventAnnotation: soundEventAnnotation,
              tag: oldTag
            });
          }

          // Add new tag
          if (newTag) {
            await addTagToSoundEventAnnotation.mutateAsync({
              soundEventAnnotation: soundEventAnnotation,
              tag: newTag
            });
          }
        } catch (error) {
          console.error('Error replacing tag:', error);
        }
      });

      await Promise.all(promises);
    },
    [annotationTask?.sound_event_annotations, removeTagFromSoundEventAnnotation, addTagToSoundEventAnnotation]
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
            tasks={tasks.tasks}
            filter={tasks._filter}
            isLoading={tasks.isLoading}
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
            {annotationTaskProps.isLoading ? (
              <Loading />
            ) : annotationTask == null ? (
              <NoTaskSelected />
            ) : (() => {
              // Calculate annotation task position among annotation tasks from the same recording
              // Find the index of the current annotation task in the list of recording annotation tasks (sorted by start time)
              const sortedTasks = [...tasks.tasks.filter(task => task.recording_id === annotationTask.recording_id)].sort((a, b) => a.start_time - b.start_time);
              const currentTaskIndex = sortedTasks.findIndex(
                task => task.id === annotationTask.id
              );
              return (
              <div className="flex flex-col gap-2">
                <RecordingAnnotationContext
                  recording={annotationTask.recording!}
                  currentTaskIndex={currentTaskIndex >= 0 ? currentTaskIndex + 1 : undefined}
                  totalTasks={sortedTasks.length}
                />
                <div className="min-w-0 grow-0">
                  <AnnotationTaskSpectrogram
                    parameters={parameters}
                    annotationTaskProps={annotationTaskProps}
                    defaultTags={tagPalette}
                    selectedTag={selectedTag}
                    onClearSelectedTag={setSelectedTag}
                    onParameterSave={onParameterSave}
                    selectedSoundEventAnnotation={selectedSoundEventAnnotation}
                    onSelectSoundEventAnnotation={setSelectedSoundEventAnnotation}
                    withSpectrogram={withSpectrogram}
                    onWithSpectrogramChange={onWithSpectrogramChange}
                    withSoundEvent={withSoundEvent}
                    onWithSoundEventChange={onWithSoundEventChange}
                    withAutoplay={withAutoplay}
                    onWithAutoplayChange={onWithAutoplayChange}
                    fixedAspectRatio={fixedAspectRatio}
                    toggleFixedAspectRatio={toggleFixedAspectRatio}
                    onSegmentsLoaded={tasks.handleCurrentSegmentsLoaded}
                  />
                </div>
              </div>
              );
            })()}
          </div>

          {selectedSoundEventAnnotation == null || annotationTask == null ? (
            <div className="w-[35rem] flex-none mt-9">
              <Empty
                padding="p-0">
                No sound event annotation selected. Select a sound event annotation to view details.
              </Empty>
            </div>
          ) : (
            <div className="w-[35rem] flex-none mt-5">
              <SelectedSoundEventAnnotation
                annotationTask={annotationTask}
                soundEventAnnotation={selectedSoundEventAnnotation}
                parameters={parameters}
                withSpectrogram={withSpectrogram}
                onUpdate={onUpdateSelectedSoundEventAnnotation}
              />
            </div>
          )}
        </div>


        {annotationTask && (
          <div className="flex flex-row gap-4 w-full">
            <div className="min-w-[63rem] flex flex-col gap-4">
              <RecordingTagBar
                recording={annotationTask.recording!}
              />
              <AnnotationTaskNotes
                onCreateNote={addNote.mutate}
                onDeleteNote={removeNote.mutate}
                annotationTask={annotationTask}
                currentUser={currentUser}
              />
            </div>
            <div className="min-w-[35rem]">
              <AnnotationTaskTags
                annotationTask={annotationTask}
                onReplaceTagInSoundEventAnnotations={handleReplaceTagInSoundEventAnnotations}
                selectedSoundEventAnnotation={selectedSoundEventAnnotation}
              />
            </div>
          </div>
        )}
      </div>

      {isDeletePopoverOpen && (
        <Popover as="div">
          {({ open, close }) => {

            const handleOverlayClick = (e: React.MouseEvent) => {
              // Check if click is inside menu
              if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setIsDeletePopoverOpen(false);
              }
            };

            return (
              <>
                <PopoverButton as="div" className="hidden" />
                <PopoverPanel static={true} className="fixed inset-0 z-50">
                  <div className="fixed inset-0 flex items-center justify-center" onClick={handleOverlayClick}>
                    <div ref={menuRef} className="relative w-96 divide-y divide-stone-100 rounded-md bg-stone-50 dark:bg-stone-700 border border-stone-200 dark:border-stone-500 shadow-md dark:shadow-stone-800 ring-1 ring-stone-900 ring-opacity-5 focus:outline-none">
                      <div className="p-4">
                        <div className="mb-2 text-stone-700 dark:text-stone-300 underline underline-offset-2 decoration-amber-500 decoration-2">
                          Select a tag to remove from {selectedSoundEventAnnotation ? 'selected sound event annotation' : 'all sound event annotations'}
                        </div>
                        <SearchMenu
                          limit={100}
                          options={selectedSoundEventAnnotation
                            ? (selectedSoundEventAnnotation.tags || []).map(tag => ({ tag, count: 1 }))
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
                </PopoverPanel>
              </>
            );
          }}
        </Popover>
      )}

      {isTagPopoverOpen && (
        <Popover as="div">
          {({ open, close }) => {

            const handleOverlayClick = (e: React.MouseEvent) => {
              // Check if click is inside menu
              if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setIsTagPopoverOpen(false);
              }
            };

            return (
              <>
                <PopoverButton as="div" className="hidden" />
                <PopoverPanel static={true} className="fixed inset-0 z-50">
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
                </PopoverPanel>
              </>
            );
          }}
        </Popover>
      )}
    </div>
  );
}

function NoTaskSelected() {
  return <Empty>No task selected</Empty>;
}
