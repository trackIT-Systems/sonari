import { useCallback, useState, useMemo, useEffect, useRef, CSSProperties } from "react";

import { DEFAULT_SPECTROGRAM_PARAMETERS } from "@/api/spectrograms";
import AnnotationProgress from "@/components/annotation_tasks/AnnotationProgress";
import RecordingAnnotationContext from "@/components/annotation_tasks/RecordingAnnotationContext";
import SelectedSoundEventAnnotation from "@/components/annotation_tasks/SelectedSoundEventAnnotation";
import AnnotationTaskStatus from "@/components/annotation_tasks/AnnotationTaskStatus";
import AnnotationTaskSpectrogram from "@/components/annotation_tasks/AnnotationTaskSpectrogram";
import Empty from "@/components/Empty";
import Loading from "@/components/Loading";
import useAnnotateTasks from "@/hooks/annotation/useAnnotateTasks";
import useRecordingAnnotationTasks from "@/hooks/annotation/useRecordingAnnotationTasks";
import AnnotationTaskTagBar from "@/components/annotation_tasks/AnnotationTaskTagBar";
import useAnnotateTasksKeyShortcuts from "@/hooks/annotation/useTaskStatusKeyShortcuts";

import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import SearchMenu from "@/components/search/SearchMenu";
import TagComponent, { getTagKey } from "@/components/tags/Tag";

import { SOUND_EVENT_CYCLE_FILTER_SHORTCUT, DELETE_TAG_SHORTCUT, ABORT_SHORTCUT } from "@/utils/keyboard";

import type { AnnotationTaskFilter } from "@/api/annotation_tasks";
import type { NoteCreate } from "@/api/notes";
import type {
  AnnotationTask,
  AnnotationStatus,
  SoundEventAnnotation,
  SpectrogramParameters,
  Tag,
  User,
  Note,
  Geometry,
} from "@/types";
import AnnotationTaskNotes from "./AnnotationTaskNotes";
import AnnotationTaskTags from "@/components/annotation_tasks/AnnotationTaskTags";
import { SPECTROGRAM_CONTAINER_WIDTH } from "@/constants";

export default function AnnotateTasks({
  taskFilter,
  parameters = DEFAULT_SPECTROGRAM_PARAMETERS,
  annotationTask,
  isLoadingTask,
  currentUser,
  onChangeTask,
  onParameterSave,
  onCompleteTask,
  onUnsureTask,
  onRejectTask,
  onVerifyTask,
  onAddBadge,
  onRemoveBadge,
  onAddNote,
  onRemoveNote,
  onAddTag,
  onRemoveTag,
  onAddTagToSoundEventAnnotation,
  onRemoveTagFromSoundEventAnnotation,
  onAddSoundEventAnnotation,
  onRemoveSoundEventAnnotation,
  onUpdateSoundEventAnnotation,
  sourceTaskId = null,
  onSourceTaskChange,
  sourceAnnotationTask,
  onSourceAddSoundEventAnnotation,
  onSourceRemoveSoundEventAnnotation,
  onSourceUpdateSoundEventAnnotation,
  onSourceAddTagToSoundEventAnnotation,
  onSourceRemoveTagFromSoundEventAnnotation,
}: {
  /** Filter to select which tasks are to be annotated */
  taskFilter?: AnnotationTaskFilter;
  /** Parameters to use for spectrogram rendering */
  parameters?: SpectrogramParameters;
  /** An optional annotation task to use initially */
  annotationTask?: AnnotationTask;
  /** Loading state for the annotation task */
  isLoadingTask?: boolean;
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
  onAddBadge?: (task: AnnotationTask, state: AnnotationStatus) => Promise<AnnotationTask>;
  onRemoveBadge?: (task: AnnotationTask, state: AnnotationStatus, userId?: string) => Promise<AnnotationTask>;
  onAddNote?: (note: NoteCreate) => void;
  onRemoveNote?: (note: Note) => void;
  onAddTag?: (tag: Tag) => void;
  onRemoveTag?: (tag: Tag) => void;
  onAddTagToSoundEventAnnotation?: (params: { soundEventAnnotation: SoundEventAnnotation; tag: Tag }) => Promise<SoundEventAnnotation>;
  onRemoveTagFromSoundEventAnnotation?: (params: { soundEventAnnotation: SoundEventAnnotation; tag: Tag }) => Promise<SoundEventAnnotation>;
  onAddSoundEventAnnotation?: (params: { geometry: Geometry; tags: Tag[] }) => Promise<SoundEventAnnotation>;
  onRemoveSoundEventAnnotation?: (annotation: SoundEventAnnotation) => void;
  onUpdateSoundEventAnnotation?: (params: { soundEventAnnotation: SoundEventAnnotation; geometry: Geometry }) => void;
  sourceTaskId?: number | null;
  onSourceTaskChange?: (sourceTaskId: number | null) => void;
  sourceAnnotationTask?: AnnotationTask;
  onSourceAddSoundEventAnnotation?: (params: { geometry: Geometry; tags: Tag[] }) => Promise<SoundEventAnnotation>;
  onSourceRemoveSoundEventAnnotation?: (annotation: SoundEventAnnotation) => void;
  onSourceUpdateSoundEventAnnotation?: (params: { soundEventAnnotation: SoundEventAnnotation; geometry: Geometry }) => void;
  onSourceAddTagToSoundEventAnnotation?: (params: { soundEventAnnotation: SoundEventAnnotation; tag: Tag }) => Promise<SoundEventAnnotation>;
  onSourceRemoveTagFromSoundEventAnnotation?: (params: { soundEventAnnotation: SoundEventAnnotation; tag: Tag }) => Promise<SoundEventAnnotation>;
}) {
  const [tagPalette, setTagPalette] = useState<Tag[]>([]);
  const [selectedTag, setSelectedTag] = useState<{ tag: Tag; count: number } | null>(null);
  
  const [selectedSoundEventAnnotation, setSelectedSoundEventAnnotation] = useState<SoundEventAnnotation | null>(null);
  const onDeselectSoundEventAnnotation = useCallback(() => {
    setSelectedSoundEventAnnotation(null);
  }, []);

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

  const tasks = useAnnotateTasks({
    filter: taskFilter,
    annotationTask,
    onChangeTask,
    onCompleteTask,
    onUnsureTask,
    onRejectTask,
    onVerifyTask,
    onDeselectSoundEventAnnotation,
  });

  const { tasks: recordingTasks } =
    useRecordingAnnotationTasks({
      recordingId: annotationTask?.recording_id,
      enabled: annotationTask != null,
    });

  const isUsingSource =
    sourceTaskId != null && sourceAnnotationTask != null;

  const displayedSoundEventAnnotations = useMemo(() => {
    if (isUsingSource) {
      return sourceAnnotationTask.sound_event_annotations ?? [];
    }
    return annotationTask?.sound_event_annotations ?? [];
  }, [
    isUsingSource,
    sourceAnnotationTask,
    annotationTask?.sound_event_annotations,
  ]);

  const displayAnnotationTask = useMemo(() => {
    if (annotationTask == null) return null;
    return {
      ...annotationTask,
      sound_event_annotations: displayedSoundEventAnnotations,
    };
  }, [annotationTask, displayedSoundEventAnnotations]);

  const activeAddSoundEventAnnotation = isUsingSource
    ? onSourceAddSoundEventAnnotation
    : onAddSoundEventAnnotation;
  const activeRemoveSoundEventAnnotation = isUsingSource
    ? onSourceRemoveSoundEventAnnotation
    : onRemoveSoundEventAnnotation;
  const activeUpdateSoundEventAnnotation = isUsingSource
    ? onSourceUpdateSoundEventAnnotation
    : onUpdateSoundEventAnnotation;
  const activeAddTagToSoundEventAnnotation = isUsingSource
    ? onSourceAddTagToSoundEventAnnotation
    : onAddTagToSoundEventAnnotation;
  const activeRemoveTagFromSoundEventAnnotation = isUsingSource
    ? onSourceRemoveTagFromSoundEventAnnotation
    : onRemoveTagFromSoundEventAnnotation;

  const selectedSoundEventAnnotationTask = isUsingSource
    ? sourceAnnotationTask
    : annotationTask;

  const prevTaskIdRef = useRef(annotationTask?.id);
  useEffect(() => {
    if (
      prevTaskIdRef.current !== annotationTask?.id &&
      prevTaskIdRef.current != null
    ) {
      onSourceTaskChange?.(null);
      setSelectedSoundEventAnnotation(null);
    }
    prevTaskIdRef.current = annotationTask?.id;
  }, [annotationTask?.id, onSourceTaskChange]);

  useEffect(() => {
    setSelectedSoundEventAnnotation(null);
  }, [sourceTaskId]);

  useEffect(() => {
    setSelectedSoundEventAnnotation((current) => {
      if (current == null) {
        return null;
      }
      const stillVisible = displayedSoundEventAnnotations.some(
        (annotation) => annotation.id === current.id,
      );
      return stillVisible ? current : null;
    });
  }, [displayedSoundEventAnnotations]);

  // Wrapper functions that combine badge mutations with navigation
  const handleMarkCompleted = useCallback(async () => {
    if (!annotationTask || !onAddBadge) return;
    try {
      await onAddBadge(annotationTask, "completed");
      onCompleteTask?.();
      tasks.nextTask();
    } catch (error) {
      console.error("Failed to mark task as completed:", error);
    }
  }, [annotationTask, onAddBadge, onCompleteTask, tasks]);

  const handleMarkRejected = useCallback(async () => {
    if (!annotationTask || !onAddBadge) return;
    try {
      await onAddBadge(annotationTask, "rejected");
      onRejectTask?.();
      tasks.nextTask();
    } catch (error) {
      console.error("Failed to mark task as rejected:", error);
    }
  }, [annotationTask, onAddBadge, onRejectTask, tasks]);

  const handleMarkUnsure = useCallback(async () => {
    if (!annotationTask || !onAddBadge) return;
    try {
      await onAddBadge(annotationTask, "assigned");
      onUnsureTask?.();
      tasks.nextTask();
    } catch (error) {
      console.error("Failed to mark task as unsure:", error);
    }
  }, [annotationTask, onAddBadge, onUnsureTask, tasks]);

  const handleMarkVerified = useCallback(async () => {
    if (!annotationTask || !onAddBadge) return;
    try {
      await onAddBadge(annotationTask, "verified");
      onVerifyTask?.();
      tasks.nextTask();
    } catch (error) {
      console.error("Failed to mark task as verified:", error);
    }
  }, [annotationTask, onAddBadge, onVerifyTask, tasks]);

  const handleRemoveBadge = useCallback(async (state: AnnotationStatus, userId?: string) => {
    if (!annotationTask || !onRemoveBadge) return;
    try {
      await onRemoveBadge(annotationTask, state, userId);
    } catch (error) {
      console.error("Failed to remove badge:", error);
    }
  }, [annotationTask, onRemoveBadge]);

  useAnnotateTasksKeyShortcuts({
    onGoNext: tasks.nextTask,
    onGoPrevious: tasks.prevTask,
    onMarkCompleted: handleMarkCompleted,
    onMarkUnsure: handleMarkUnsure,
    onMarkRejected: handleMarkRejected,
    onMarkVerified: handleMarkVerified,
  });

  const handleRemoveTagFromSoundEventAnnotations = useCallback(
    async (tagToRemove: Tag) => {
      if (!displayedSoundEventAnnotations.length || !activeRemoveTagFromSoundEventAnnotation) return;
      const promises = displayedSoundEventAnnotations
        .filter(soundEventAnnotation =>
          soundEventAnnotation.tags?.some(
            tag => tag.key === tagToRemove.key && tag.value === tagToRemove.value
          )
        )
        .map(soundEventAnnotation => {
          return activeRemoveTagFromSoundEventAnnotation({
            soundEventAnnotation: soundEventAnnotation,
            tag: tagToRemove
          });
        });

      await Promise.all(promises);
    },
    [displayedSoundEventAnnotations, activeRemoveTagFromSoundEventAnnotation]
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
    if (!displayedSoundEventAnnotations.length) return [];

    const allTags = displayedSoundEventAnnotations.flatMap(soundEventAnnotation => soundEventAnnotation.tags || []);
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
  }, [displayedSoundEventAnnotations]);

  const handleDeleteTagFromAll = useCallback(
    async (tagWithCount: { tag: Tag; count: number }, shouldDelete: boolean) => {
      if (shouldDelete && activeRemoveTagFromSoundEventAnnotation) {
        if (selectedSoundEventAnnotation) {
          await activeRemoveTagFromSoundEventAnnotation({
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
    [handleRemoveTagFromSoundEventAnnotations, activeRemoveTagFromSoundEventAnnotation, selectedSoundEventAnnotation]
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
      if (!displayedSoundEventAnnotations.length || !activeRemoveTagFromSoundEventAnnotation || !activeAddTagToSoundEventAnnotation) return;

      let soundEventAnnotationsToUpdate: SoundEventAnnotation[] = [];
      if (currentAnnotation) {
        soundEventAnnotationsToUpdate = [currentAnnotation];
      } else {
        if (oldTag?.key === "all") {
          soundEventAnnotationsToUpdate = displayedSoundEventAnnotations.filter(soundEventAnnotation =>
            soundEventAnnotation.tags && soundEventAnnotation.tags.length > 0
          );
        } else if (oldTag) {
          soundEventAnnotationsToUpdate = displayedSoundEventAnnotations.filter(soundEventAnnotation =>
            soundEventAnnotation.tags?.some(
              tag => tag.key === oldTag.key && tag.value === oldTag.value
            )
          );
        } else {
          soundEventAnnotationsToUpdate = displayedSoundEventAnnotations;
        }
      }

      const promises = soundEventAnnotationsToUpdate.map(async soundEventAnnotation => {
        try {
          if (oldTag?.key === "all" && soundEventAnnotation.tags) {
            for (const tag of soundEventAnnotation.tags) {
              await activeRemoveTagFromSoundEventAnnotation({
                soundEventAnnotation: soundEventAnnotation,
                tag
              });
            }
          } else if (oldTag) {
            await activeRemoveTagFromSoundEventAnnotation({
              soundEventAnnotation: soundEventAnnotation,
              tag: oldTag
            });
          }

          if (newTag) {
            await activeAddTagToSoundEventAnnotation({
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
    [displayedSoundEventAnnotations, activeRemoveTagFromSoundEventAnnotation, activeAddTagToSoundEventAnnotation]
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
      <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start">
        <div
          className="max-w-full shrink-0"
          style={{ width: `${SPECTROGRAM_CONTAINER_WIDTH}px` }}
        >
          <AnnotationProgress
            current={tasks.current}
            taskCount={tasks.tasks.length}
            stats={tasks.stats}
            filter={tasks._filter}
            isLoading={tasks.isLoading}
            onNext={tasks.nextTask}
            onPrevious={tasks.prevTask}
          />
        </div>
        {annotationTask != null && (
          <div className="hidden w-[35rem] max-w-full shrink-0 2xl:block">
            <AnnotationTaskStatus
              task={annotationTask}
              onReview={handleMarkRejected}
              onDone={handleMarkCompleted}
              onUnsure={handleMarkUnsure}
              onVerify={handleMarkVerified}
              onRemoveBadge={handleRemoveBadge}
            />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-4">
        {/*
          Below 2xl: stacked column — sound-event + all-tags max width matches spectrogram column.
          2xl+: row spectrogram | 35rem sidebar; bottom row as before.
        */}
        <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start">
          <div
            className="max-w-full shrink-0"
            style={{ width: `${SPECTROGRAM_CONTAINER_WIDTH}px` }}
          >
            {isLoadingTask ? (
              <Loading />
            ) : annotationTask == null ? (
              <NoTaskSelected />
            ) : (() => {
              const sortedTasks = [...tasks.tasks.filter(task => task.recording_id === annotationTask.recording_id)].sort((a, b) => a.start_time - b.start_time);
              const currentTaskIndex = sortedTasks.findIndex(
                task => task.id === annotationTask.id
              );
              return (
              <div className="flex flex-col gap-2">
                <div className="2xl:hidden w-full min-w-0">
                  <AnnotationTaskStatus
                    task={annotationTask}
                    onReview={handleMarkRejected}
                    onDone={handleMarkCompleted}
                    onUnsure={handleMarkUnsure}
                    onVerify={handleMarkVerified}
                    onRemoveBadge={handleRemoveBadge}
                  />
                </div>
                <RecordingAnnotationContext
                  recording={annotationTask.recording!}
                  currentTaskIndex={currentTaskIndex >= 0 ? currentTaskIndex + 1 : undefined}
                  totalTasks={sortedTasks.length}
                  currentTaskId={annotationTask.id}
                  annotationTaskSources={recordingTasks}
                  sourceTaskId={sourceTaskId}
                  onSourceTaskChange={onSourceTaskChange}
                />
                <div className="min-w-0 grow-0">
                  <AnnotationTaskSpectrogram
                    key={annotationTask.id}
                    parameters={parameters}
                    annotationTask={annotationTask}
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
                    onAddTagToSoundEventAnnotation={activeAddTagToSoundEventAnnotation}
                    onRemoveTagFromSoundEventAnnotation={activeRemoveTagFromSoundEventAnnotation}
                    onAddSoundEventAnnotation={activeAddSoundEventAnnotation}
                    onRemoveSoundEventAnnotation={activeRemoveSoundEventAnnotation}
                    onUpdateSoundEventAnnotation={activeUpdateSoundEventAnnotation}
                    soundEventAnnotationsOverride={displayedSoundEventAnnotations}
                  />
                </div>
              </div>
              );
            })()}
          </div>

          <div
            data-annotate-stacked-sidebar
            className="flex min-w-0 w-full shrink-0 flex-col gap-4 2xl:w-[35rem] 2xl:flex-none"
            style={
              {
                ["--spectrogram-container-w"]: `${SPECTROGRAM_CONTAINER_WIDTH}px`,
              } as CSSProperties
            }
          >
            {selectedSoundEventAnnotation == null || annotationTask == null ? (
              <div className="mt-0 w-full min-w-0 2xl:mt-9">
                <Empty
                  padding="p-0">
                  No sound event annotation selected. Select a sound event annotation to view details.
                </Empty>
              </div>
            ) : (
              <div className="mt-0 w-full min-w-0 2xl:mt-5">
                <SelectedSoundEventAnnotation
                  key={selectedSoundEventAnnotation.id}
                  annotationTask={selectedSoundEventAnnotationTask!}
                  samplerate={annotationTask.recording!.samplerate}
                  soundEventAnnotation={selectedSoundEventAnnotation}
                  parameters={parameters}
                  withSpectrogram={withSpectrogram}
                  onUpdate={onUpdateSelectedSoundEventAnnotation}
                />
              </div>
            )}
            {displayAnnotationTask != null && (
              <div className="block w-full min-w-0 2xl:hidden">
                <AnnotationTaskTags
                  annotationTask={displayAnnotationTask}
                  onReplaceTagInSoundEventAnnotations={handleReplaceTagInSoundEventAnnotations}
                  selectedSoundEventAnnotation={selectedSoundEventAnnotation}
                />
              </div>
            )}
          </div>
        </div>

        {annotationTask != null && (
          <>
            <div className="hidden w-full min-w-0 flex-row items-start gap-4 2xl:flex">
              <div
                className="flex max-w-full shrink-0 flex-col gap-4"
                style={{ width: `${SPECTROGRAM_CONTAINER_WIDTH}px` }}
              >
                <AnnotationTaskTagBar
                  annotationTask={annotationTask}
                  onAddTag={onAddTag}
                  onRemoveTag={onRemoveTag}
                />
                <AnnotationTaskNotes
                  onCreateNote={onAddNote}
                  onDeleteNote={onRemoveNote}
                  annotationTask={annotationTask}
                  currentUser={currentUser}
                />
              </div>
              <div className="min-w-0 w-[35rem] max-w-full shrink-0">
                <AnnotationTaskTags
                  annotationTask={displayAnnotationTask!}
                  onReplaceTagInSoundEventAnnotations={handleReplaceTagInSoundEventAnnotations}
                  selectedSoundEventAnnotation={selectedSoundEventAnnotation}
                />
              </div>
            </div>
            <div
              className="flex max-w-full shrink-0 flex-col gap-4 2xl:hidden"
              style={{ width: `${SPECTROGRAM_CONTAINER_WIDTH}px` }}
            >
              <AnnotationTaskTagBar
                annotationTask={annotationTask}
                onAddTag={onAddTag}
                onRemoveTag={onRemoveTag}
              />
              <AnnotationTaskNotes
                onCreateNote={onAddNote}
                onDeleteNote={onRemoveNote}
                annotationTask={annotationTask}
                currentUser={currentUser}
              />
            </div>
          </>
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
