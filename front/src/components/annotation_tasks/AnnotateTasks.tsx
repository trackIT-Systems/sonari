import { useCallback, useContext, useState, useMemo, useEffect, useRef, CSSProperties } from "react";
import AnnotationProjectContext from "@/app/(base)/annotation_projects/detail/context";
import { useKeyPressEvent } from "react-use";
import classNames from "classnames";

import { DEFAULT_SPECTROGRAM_PARAMETERS } from "@/api/spectrograms";
import AnnotationProgress from "@/components/annotation_tasks/AnnotationProgress";
import AnnotationTaskStatus from "@/components/annotation_tasks/AnnotationTaskStatus";
import RecordingAnnotationContext from "@/components/annotation_tasks/RecordingAnnotationContext";
import SelectedSoundEventAnnotation from "@/components/annotation_tasks/SelectedSoundEventAnnotation";
import AnnotationTaskSpectrogram from "@/components/annotation_tasks/AnnotationTaskSpectrogram";
import Button from "@/components/Button";
import Empty from "@/components/Empty";
import { SpectrogramSettingsIcon } from "@/components/icons";
import Loading from "@/components/Loading";
import Tooltip from "@/components/Tooltip";
import useAnnotateTasks from "@/hooks/annotation/useAnnotateTasks";
import useRecordingAnnotationTasks from "@/hooks/annotation/useRecordingAnnotationTasks";
import AnnotationTaskTagBar from "@/components/annotation_tasks/AnnotationTaskTagBar";
import useAnnotateTasksKeyShortcuts from "@/hooks/annotation/useTaskStatusKeyShortcuts";
import useAnnotationUndoKeyShortcuts from "@/hooks/annotation/useAnnotationUndoKeyShortcuts";
import type { AnnotationHistoryControls } from "@/hooks/annotation/useAnnotationUndoKeyShortcuts";
import type { HistoryReplayEvent } from "@/hooks/annotation/annotationHistoryTypes";

import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import SearchMenu from "@/components/search/SearchMenu";
import TagComponent, { getTagKey } from "@/components/tags/Tag";

import { blurActiveElement } from "@/utils/focus";
import { emitGuidedTourEvent, useGuidedTourReturnEvent } from "@/components/workshop/guidedTour/events";
import {
  GROUP_TAG_KEY,
  isReplaceAllTag,
  isSpeciesOfGroup,
  soundEventAnnotationsForTagReplace,
} from "@/utils/soundEventTagReplace";
import { SOUND_EVENT_CYCLE_FILTER_SHORTCUT, DELETE_TAG_SHORTCUT, ABORT_SHORTCUT, FULLSCREEN_SHORTCUT } from "@/utils/keyboard";
import useKeyFilter from "@/hooks/utils/useKeyFilter";

import type { AnnotationTaskFilter } from "@/api/annotation_tasks";
import type { NoteCreate } from "@/api/notes";
import type {
  AnnotationTask,
  AnnotationStatus,
  SoundEventAnnotation,
  SpectrogramParameters,
  SpectrogramWindow,
  Tag,
  User,
  Note,
  Geometry,
} from "@/types";
import AnnotationTaskNotes from "./AnnotationTaskNotes";
import AnnotationTaskTags from "@/components/annotation_tasks/AnnotationTaskTags";
import { SPECTROGRAM_CONTAINER_WIDTH } from "@/constants";
import { DEFAULT_TAG_VISIBILITY } from "@/utils/passes";
import type { TagVisibilityFilter } from "@/utils/passes";

const NO_IDS = new Set<number>();

/** Tags of these sound events with how many of them carry each. */
function countTags(soundEventAnnotations: SoundEventAnnotation[]): { tag: Tag; count: number }[] {
  const counts = new Map<string, { tag: Tag; count: number }>();
  for (const sea of soundEventAnnotations) {
    for (const tag of sea.tags ?? []) {
      const key = `${tag.key}-${tag.value}`;
      const entry = counts.get(key);
      if (entry) entry.count += 1;
      else counts.set(key, { tag, count: 1 });
    }
  }
  return Array.from(counts.values());
}

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
  annotationHistory,
  sourceAnnotationHistory,
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
  annotationHistory?: AnnotationHistoryControls;
  sourceAnnotationHistory?: AnnotationHistoryControls;
}) {
  const isGuidedTour = useContext(AnnotationProjectContext)?.is_guided_tour ?? false;
  const [tagPalette, setTagPalette] = useState<Tag[]>([]);
  const [selectedTag, setSelectedTag] = useState<{ tag: Tag; count: number } | null>(null);
  // The cycle tag (top right of the spectrogram) is per task: close it when
  // the next task opens instead of carrying a stale tag preview over.
  const currentTaskId = annotationTask?.id;
  useEffect(() => {
    setSelectedTag(null);
    setMultiSelectedIds(NO_IDS);
  }, [currentTaskId]);
  const [tagVisibility, setTagVisibility] = useState<TagVisibilityFilter>(DEFAULT_TAG_VISIBILITY);
  const [liveParameters, setLiveParameters] = useState<SpectrogramParameters>(parameters);

  useEffect(() => {
    setLiveParameters(parameters);
  }, [parameters]);

  useEffect(() => {
    blurActiveElement();
  }, []);

  const handleParameterChange = useCallback((next: SpectrogramParameters) => {
    setLiveParameters(next);
  }, []);
  
  const [selectedSoundEventAnnotation, setSelectedSoundEventAnnotation] = useState<SoundEventAnnotation | null>(null);
  /**
   * All selected sound events when Shift + click selected several (always 2+,
   * the primary `selectedSoundEventAnnotation` among them). Tag actions then
   * apply to exactly these; otherwise to the selected one, or to all.
   */
  const [multiSelectedIds, setMultiSelectedIds] = useState<Set<number>>(NO_IDS);
  const onDeselectSoundEventAnnotation = useCallback(() => {
    setSelectedSoundEventAnnotation(null);
    setMultiSelectedIds(NO_IDS);
  }, []);

  /** Single selection (click, n / b, Esc): ends a multi-selection. */
  const handleSelectSoundEventAnnotation = useCallback((annotation: SoundEventAnnotation | null) => {
    setSelectedSoundEventAnnotation(annotation);
    setMultiSelectedIds((prev) => (annotation != null && prev.has(annotation.id) ? prev : NO_IDS));
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

  const [mainSpectrogramWindow, setMainSpectrogramWindow] =
    useState<SpectrogramWindow | null>(null);
  const handleMainWindowChange = useCallback((window: SpectrogramWindow) => {
    setMainSpectrogramWindow((prev) => {
      if (
        prev != null &&
        prev.time.min === window.time.min &&
        prev.time.max === window.time.max &&
        prev.freq.min === window.freq.min &&
        prev.freq.max === window.freq.max
      ) {
        return prev;
      }
      return window;
    });
  }, []);

  // Report user pan/zoom to the guided tour. The first window of each task is
  // the initial view, not a user action.
  const lastWindowRef = useRef<{ taskId?: number; window: SpectrogramWindow } | null>(null);
  useEffect(() => {
    if (mainSpectrogramWindow == null) return;
    const last = lastWindowRef.current;
    lastWindowRef.current = { taskId: annotationTask?.id, window: mainSpectrogramWindow };
    if (last == null || last.taskId !== annotationTask?.id) return;
    const span = (w: SpectrogramWindow) => [w.time.max - w.time.min, w.freq.max - w.freq.min];
    const [prevT, prevF] = span(last.window);
    const [nextT, nextF] = span(mainSpectrogramWindow);
    const resized = Math.abs(prevT - nextT) > 1e-9 || Math.abs(prevF - nextF) > 1e-6;
    emitGuidedTourEvent(resized ? "view-zoomed" : "view-panned");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only window changes are user actions
  }, [mainSpectrogramWindow]);

  // Full page view: only the spectrogram, scaled up to fill the page. Panels
  // are hidden or swapped for headless versions, never remounted elsewhere, so
  // playback, zoom and drafts survive toggling.
  const [fullscreen, setFullscreen] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const toggleFullscreen = useCallback(() => {
    setFullscreen((prev) => {
      if (!prev) {
        setShowTools(false);
      }
      return !prev;
    });
  }, []);
  useKeyPressEvent(useKeyFilter({ key: FULLSCREEN_SHORTCUT }), toggleFullscreen);

  const [fixedAspectRatio, setFixedAspectRatio] = useState(false);
  const toggleFixedAspectRatio = useCallback(() => {
    setFixedAspectRatio(prev => !prev);
  }, []);

  const tasks = useAnnotateTasks({
    filter: taskFilter,
    persistFilter: !isGuidedTour,
    annotationTask,
    onChangeTask,
    onCompleteTask,
    onUnsureTask,
    onRejectTask,
    onVerifyTask,
    onDeselectSoundEventAnnotation,
  });

  // The guided tour asks users to undo what they toggled (hidden spectrogram or
  // events, full page view), so report the way back, not the first toggle.
  useGuidedTourReturnEvent(withSpectrogram, true, "spectrogram-shown");
  useGuidedTourReturnEvent(withSoundEvent, true, "sound-events-shown");
  useGuidedTourReturnEvent(fullscreen, false, "fullscreen-exited");

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

  const multiSelectedSoundEventAnnotations = useMemo(
    () =>
      multiSelectedIds.size > 1
        ? displayedSoundEventAnnotations.filter((sea) => multiSelectedIds.has(sea.id))
        : [],
    [multiSelectedIds, displayedSoundEventAnnotations],
  );
  const isMultiSelect = multiSelectedSoundEventAnnotations.length > 1;

  /** Shift + click: add a sound event to, or remove it from, the selection. */
  const handleToggleSelectSoundEventAnnotation = useCallback(
    (annotation: SoundEventAnnotation) => {
      const next = new Set(
        multiSelectedIds.size > 0
          ? multiSelectedIds
          : selectedSoundEventAnnotation
            ? [selectedSoundEventAnnotation.id]
            : [],
      );
      if (next.has(annotation.id)) next.delete(annotation.id);
      else next.add(annotation.id);
      setMultiSelectedIds(next.size > 1 ? next : NO_IDS);

      // Keep the primary (details panel, edit handles) inside the selection.
      if (selectedSoundEventAnnotation == null || !next.has(selectedSoundEventAnnotation.id)) {
        const primaryId = next.has(annotation.id) ? annotation.id : Array.from(next).pop();
        setSelectedSoundEventAnnotation(
          displayedSoundEventAnnotations.find((sea) => sea.id === primaryId) ?? null,
        );
      }
    },
    [multiSelectedIds, selectedSoundEventAnnotation, displayedSoundEventAnnotations],
  );

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

  const activeHistory = isUsingSource ? sourceAnnotationHistory : annotationHistory;

  const applyHistoryReplayEvents = useCallback((events: HistoryReplayEvent[]) => {
    for (const event of events) {
      if (event.type === "removed") {
        setSelectedSoundEventAnnotation((current) =>
          current?.id === event.serverId ? null : current,
        );
      } else if (event.type === "restored") {
        setSelectedSoundEventAnnotation(event.soundEvent);
      }
    }
  }, []);

  const handleUndo = useCallback(async () => {
    if (!activeHistory?.canUndo) {
      return;
    }
    const events = await activeHistory.undo();
    applyHistoryReplayEvents(events);
    emitGuidedTourEvent("undo");
  }, [activeHistory, applyHistoryReplayEvents]);

  const handleRedo = useCallback(async () => {
    if (!activeHistory?.canRedo) {
      return;
    }
    const events = await activeHistory.redo();
    applyHistoryReplayEvents(events);
    emitGuidedTourEvent("redo");
  }, [activeHistory, applyHistoryReplayEvents]);

  useAnnotationUndoKeyShortcuts({
    enabled: activeHistory != null,
    canUndo: activeHistory?.canUndo ?? false,
    canRedo: activeHistory?.canRedo ?? false,
    onUndo: () => {
      void handleUndo();
    },
    onRedo: () => {
      void handleRedo();
    },
  });

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

  const selectedSoundEventAnnotationId = selectedSoundEventAnnotation?.id;
  useEffect(() => {
    if (selectedSoundEventAnnotationId != null) emitGuidedTourEvent("sound-event-selected");
  }, [selectedSoundEventAnnotationId]);

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
  const markCompleted = useCallback(async () => {
    if (!annotationTask || !onAddBadge) return;
    try {
      await onAddBadge(annotationTask, "completed");
      onCompleteTask?.();
      tasks.nextTask();
    } catch (error) {
      console.error("Failed to mark task as completed:", error);
    }
  }, [annotationTask, onAddBadge, onCompleteTask, tasks]);

  /**
   * Accepting or verifying a task with untagged sound events is usually a
   * slip: ask first. Holds the action to run if the user goes ahead.
   */
  const [untaggedWarning, setUntaggedWarning] = useState<{
    label: string;
    untagged: SoundEventAnnotation[];
    proceed: () => void;
  } | null>(null);
  const withTaggedCheck = useCallback(
    (label: string, proceed: () => void) => {
      const untagged = (annotationTask?.sound_event_annotations ?? []).filter((sea) => !sea.tags?.length);
      if (untagged.length === 0) {
        proceed();
        return;
      }
      setUntaggedWarning({ label, untagged, proceed });
    },
    [annotationTask?.sound_event_annotations],
  );
  const handleMarkCompleted = useCallback(
    () => withTaggedCheck("Accept", () => void markCompleted()),
    [withTaggedCheck, markCompleted],
  );

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

  const markVerified = useCallback(async () => {
    if (!annotationTask || !onAddBadge) return;
    try {
      await onAddBadge(annotationTask, "verified");
      onVerifyTask?.();
      tasks.nextTask();
    } catch (error) {
      console.error("Failed to mark task as verified:", error);
    }
  }, [annotationTask, onAddBadge, onVerifyTask, tasks]);
  const handleMarkVerified = useCallback(
    () => withTaggedCheck("Verify", () => void markVerified()),
    [withTaggedCheck, markVerified],
  );

  /** Select the untagged sound events (several at once) so they can be tagged. */
  const showUntagged = useCallback((untagged: SoundEventAnnotation[]) => {
    setSelectedSoundEventAnnotation(untagged[0] ?? null);
    setMultiSelectedIds(untagged.length > 1 ? new Set(untagged.map((sea) => sea.id)) : NO_IDS);
    setUntaggedWarning(null);
  }, []);

  useEffect(() => {
    if (untaggedWarning == null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setUntaggedWarning(null);
      }
    };
    // Capture phase: the annotate shortcuts must not run behind the dialog.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [untaggedWarning]);

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
      const run = activeHistory?.runBatch ?? (async (_label, fn) => fn());
      await run("Remove tags", async () => {
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
      });
    },
    [displayedSoundEventAnnotations, activeRemoveTagFromSoundEventAnnotation, activeHistory],
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
        if (isMultiSelect) {
          const tag = tagWithCount.tag;
          const run = activeHistory?.runBatch ?? (async (_label, fn) => fn());
          await run("Remove tags", async () => {
            await Promise.all(
              multiSelectedSoundEventAnnotations
                .filter((sea) => sea.tags?.some((t) => t.key === tag.key && t.value === tag.value))
                .map((sea) => activeRemoveTagFromSoundEventAnnotation({ soundEventAnnotation: sea, tag })),
            );
          });
        } else if (selectedSoundEventAnnotation) {
          await activeRemoveTagFromSoundEventAnnotation({
            soundEventAnnotation: selectedSoundEventAnnotation,
            tag: tagWithCount.tag
          });
        } else {
          // Otherwise, remove from all sound event annotations
          await handleRemoveTagFromSoundEventAnnotations(tagWithCount.tag);
          emitGuidedTourEvent("tag-deleted-from-all");
        }
      }
      setIsDeletePopoverOpen(false);
    },
    [handleRemoveTagFromSoundEventAnnotations, activeRemoveTagFromSoundEventAnnotation, selectedSoundEventAnnotation, isMultiSelect, multiSelectedSoundEventAnnotations, activeHistory]
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

      const run = activeHistory?.runBatch ?? (async (_label, fn) => fn());
      await run("Replace tags", async () => {
        const soundEventAnnotationsToUpdate = soundEventAnnotationsForTagReplace(
          displayedSoundEventAnnotations,
          {
            oldTag,
            scopeSoundEventAnnotation: currentAnnotation ?? undefined,
            scopeSoundEventAnnotations: isMultiSelect ? multiSelectedSoundEventAnnotations : undefined,
          },
        );

        const promises = soundEventAnnotationsToUpdate.map(async soundEventAnnotation => {
          try {
            if (isReplaceAllTag(oldTag) && soundEventAnnotation.tags) {
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
      });
      emitGuidedTourEvent("tag-replaced");
      if (!currentAnnotation && !isMultiSelect) emitGuidedTourEvent("tag-replaced-on-all");
    },
    [displayedSoundEventAnnotations, activeRemoveTagFromSoundEventAnnotation, activeAddTagToSoundEventAnnotation, activeHistory, isMultiSelect, multiSelectedSoundEventAnnotations],
  );

  const handleReplaceGroupInSoundEventAnnotations = useCallback(
    async (group: string, currentAnnotation?: SoundEventAnnotation | null) => {
      if (!displayedSoundEventAnnotations.length || !activeRemoveTagFromSoundEventAnnotation || !activeAddTagToSoundEventAnnotation) return;

      const groupTag: Tag = { key: GROUP_TAG_KEY, value: group };
      const scope = isMultiSelect
        ? multiSelectedSoundEventAnnotations
        : currentAnnotation
          ? [currentAnnotation]
          : displayedSoundEventAnnotations;
      const run = activeHistory?.runBatch ?? (async (_label, fn) => fn());
      await run(`Replace ${group} species with group`, async () => {
        await Promise.all(
          scope.map(async (soundEventAnnotation) => {
            const members = (soundEventAnnotation.tags ?? []).filter((tag) =>
              isSpeciesOfGroup(tag, group),
            );
            if (members.length === 0) return;
            try {
              for (const tag of members) {
                await activeRemoveTagFromSoundEventAnnotation({ soundEventAnnotation, tag });
              }
              if (!soundEventAnnotation.tags?.some((t) => t.key === groupTag.key && t.value === groupTag.value)) {
                await activeAddTagToSoundEventAnnotation({ soundEventAnnotation, tag: groupTag });
              }
            } catch (error) {
              console.error("Error replacing group:", error);
            }
          }),
        );
      });
    },
    [displayedSoundEventAnnotations, activeRemoveTagFromSoundEventAnnotation, activeAddTagToSoundEventAnnotation, activeHistory, isMultiSelect, multiSelectedSoundEventAnnotations],
  );

  const handleAddTagToUntaggedSoundEventAnnotations = useCallback(
    async (newTag: Tag) => {
      if (!displayedSoundEventAnnotations.length || !activeAddTagToSoundEventAnnotation) {
        return;
      }

      const run = activeHistory?.runBatch ?? (async (_label, fn) => fn());
      await run("Add tag to untagged sound events", async () => {
        const untagged = (isMultiSelect ? multiSelectedSoundEventAnnotations : displayedSoundEventAnnotations).filter(
          (soundEventAnnotation) => !soundEventAnnotation.tags?.length,
        );

        await Promise.all(
          untagged.map((soundEventAnnotation) =>
            activeAddTagToSoundEventAnnotation({
              soundEventAnnotation,
              tag: newTag,
            }),
          ),
        );
      });
      emitGuidedTourEvent("untagged-events-tagged");
    },
    [displayedSoundEventAnnotations, activeAddTagToSoundEventAnnotation, activeHistory, isMultiSelect, multiSelectedSoundEventAnnotations],
  );

  const handleAddTagToSoundEventAnnotationsWithTag = useCallback(
    async (
      filterTag: Tag,
      newTag: Tag,
      currentAnnotation?: SoundEventAnnotation | null,
    ) => {
      if (!displayedSoundEventAnnotations.length || !activeAddTagToSoundEventAnnotation) {
        return;
      }

      const run = activeHistory?.runBatch ?? (async (_label, fn) => fn());
      await run("Add tag to sound events with tag", async () => {
        const soundEventAnnotationsToUpdate = soundEventAnnotationsForTagReplace(
          displayedSoundEventAnnotations,
          {
            oldTag: filterTag,
            scopeSoundEventAnnotation: currentAnnotation ?? undefined,
            scopeSoundEventAnnotations: isMultiSelect ? multiSelectedSoundEventAnnotations : undefined,
          },
        );

        const promises = soundEventAnnotationsToUpdate
          .filter(
            (soundEventAnnotation) =>
              !soundEventAnnotation.tags?.some(
                (tag) => tag.key === newTag.key && tag.value === newTag.value,
              ),
          )
          .map((soundEventAnnotation) =>
            activeAddTagToSoundEventAnnotation({
              soundEventAnnotation,
              tag: newTag,
            }),
          );

        await Promise.all(promises);
      });
    },
    [displayedSoundEventAnnotations, activeAddTagToSoundEventAnnotation, activeHistory, isMultiSelect, multiSelectedSoundEventAnnotations],
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

  const statusBadges = annotationTask != null && (
    <AnnotationTaskStatus
      compact
      task={annotationTask}
      onReview={handleMarkRejected}
      onDone={handleMarkCompleted}
      onUnsure={handleMarkUnsure}
      onVerify={handleMarkVerified}
      onRemoveBadge={handleRemoveBadge}
    />
  );

  return (
    <>
    <div
      className={
        fullscreen
          ? "fixed inset-0 z-[45] flex flex-col gap-4 overflow-hidden bg-stone-100 p-4 dark:bg-stone-900"
          : "w-full min-w-0 flex flex-col gap-4"
      }
    >
      {/* Task bar across the page; the status badges sit at its right end. */}
      <AnnotationProgress
        filtersPreviewOnly={isGuidedTour}
        current={tasks.current}
        taskCount={tasks.tasks.length}
        stats={tasks.stats}
        filter={tasks._filter}
        isLoading={tasks.isLoading}
        onNext={tasks.nextTask}
        onPrevious={tasks.prevTask}
        actions={
          annotationTask != null && (
            <>
              {statusBadges}
              {fullscreen && (
                <Tooltip
                  portal
                  tooltip={showTools ? "Hide spectrogram tools" : "Show spectrogram tools"}
                  placement="bottom-end"
                >
                  <Button
                    variant={showTools ? "primary" : "secondary"}
                    onClick={() => setShowTools((prev) => !prev)}
                  >
                    <SpectrogramSettingsIcon className="w-5 h-5" />
                  </Button>
                </Tooltip>
              )}
            </>
          )
        }
      />
      {/*
        From xl: main column (recording, spectrogram; at most the spectrogram's
        natural width, it shrinks to fit) | side column (selected sound event,
        tags; at least 24rem, takes the extra width, spans both rows), with
        task tags and notes under the spectrogram. The second row is 1fr so a
        tall side column grows it, not the gap below the spectrogram.
        From 2xl: task tags and notes go back under the side column, which no
        longer spans; the main column spans both rows instead.
        Below xl: stacked, task tags and notes last. Full page view: only the
        spectrogram.
      */}
      <div
        className={
          fullscreen
            ? "flex min-h-0 flex-1 flex-col"
            : "grid min-w-0 grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,var(--annotate-main-w))_minmax(24rem,1fr)] xl:grid-rows-[auto_1fr]"
        }
        style={
          fullscreen
            ? undefined
            : ({ ["--annotate-main-w"]: `${SPECTROGRAM_CONTAINER_WIDTH}px` } as CSSProperties)
        }
      >
        <div className={fullscreen ? "flex min-h-0 min-w-0 flex-1 flex-col" : "min-w-0 xl:col-start-1 xl:row-start-1 2xl:row-span-2"}>
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
              <div className={classNames("flex flex-col gap-2", fullscreen && "min-h-0 flex-1")}>
                <RecordingAnnotationContext
                  recording={annotationTask.recording!}
                  currentTaskIndex={currentTaskIndex >= 0 ? currentTaskIndex + 1 : undefined}
                  totalTasks={sortedTasks.length}
                  currentTaskId={annotationTask.id}
                  annotationTaskSources={recordingTasks}
                  sourceTaskId={sourceTaskId}
                  // Tour projects of other users must not be browsable from here.
                  onSourceTaskChange={isGuidedTour ? undefined : onSourceTaskChange}
                />
                <div className={fullscreen ? "flex min-h-0 min-w-0 flex-1 flex-col" : "min-w-0 grow-0"}>
                  <AnnotationTaskSpectrogram
                    key={annotationTask.id}
                    parameters={parameters}
                    annotationTask={annotationTask}
                    defaultTags={tagPalette}
                    selectedTag={selectedTag}
                    onClearSelectedTag={setSelectedTag}
                    onParameterSave={onParameterSave}
                    onParameterChange={handleParameterChange}
                    selectedSoundEventAnnotation={selectedSoundEventAnnotation}
                    onSelectSoundEventAnnotation={handleSelectSoundEventAnnotation}
                    multiSelectedIds={multiSelectedIds}
                    onToggleSelectSoundEventAnnotation={handleToggleSelectSoundEventAnnotation}
                    withSpectrogram={withSpectrogram}
                    onWithSpectrogramChange={onWithSpectrogramChange}
                    withSoundEvent={withSoundEvent}
                    onWithSoundEventChange={onWithSoundEventChange}
                    withAutoplay={withAutoplay}
                    onWithAutoplayChange={onWithAutoplayChange}
                    fixedAspectRatio={fixedAspectRatio}
                    toggleFixedAspectRatio={toggleFixedAspectRatio}
                    onSegmentsLoaded={tasks.handleCurrentSegmentsLoaded}
                    onWindowChange={handleMainWindowChange}
                    fullscreen={fullscreen}
                    showTools={fullscreen ? showTools : true}
                    onToggleFullscreen={toggleFullscreen}
                    onAddTagToSoundEventAnnotation={activeAddTagToSoundEventAnnotation}
                    onRemoveTagFromSoundEventAnnotation={activeRemoveTagFromSoundEventAnnotation}
                    onAddSoundEventAnnotation={activeAddSoundEventAnnotation}
                    onRemoveSoundEventAnnotation={activeRemoveSoundEventAnnotation}
                    onUpdateSoundEventAnnotation={activeUpdateSoundEventAnnotation}
                    soundEventAnnotationsOverride={displayedSoundEventAnnotations}
                    selectedSoundEventAnnotationTask={
                      selectedSoundEventAnnotation != null
                        ? selectedSoundEventAnnotationTask
                        : null
                    }
                    onDeselectSoundEventAnnotation={() =>
                      setSelectedSoundEventAnnotation(null)
                    }
                    mainSpectrogramWindow={mainSpectrogramWindow}
                    tagVisibility={tagVisibility}
                    onTagVisibilityChange={setTagVisibility}
                  />
                </div>
              </div>
              );
            })()}
        </div>

        {!fullscreen && (
          <div className="flex min-w-0 flex-col gap-4 xl:col-start-2 xl:row-span-2 xl:row-start-1 2xl:row-span-1">
            <div data-guided-tour="sound-event-detail" className="min-w-0">
            {selectedSoundEventAnnotation == null || annotationTask == null ? (
              <div className="w-full min-w-0">
                <Empty padding="p-2">
                  Select a sound event to see its details.
                </Empty>
              </div>
            ) : (
              <div className="w-full min-w-0">
                {isMultiSelect && (
                  <div
                    role="status"
                    className="mb-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-100"
                  >
                    <span className="font-semibold">{multiSelectedSoundEventAnnotations.length} sound events selected.</span>{" "}
                    Adding, removing and replacing tags applies to all of them. Shift + click adds or removes an event, Esc clears the selection.
                  </div>
                )}
                <SelectedSoundEventAnnotation
                  key={selectedSoundEventAnnotation.id}
                  annotationTask={selectedSoundEventAnnotationTask!}
                  samplerate={annotationTask.recording!.samplerate}
                  soundEventAnnotation={selectedSoundEventAnnotation}
                  parameters={liveParameters}
                  withSpectrogram={withSpectrogram}
                  referenceWindow={mainSpectrogramWindow}
                  onUpdate={onUpdateSelectedSoundEventAnnotation}
                  tagVisibility={tagVisibility}
                  onSelectSoundEventAnnotation={handleSelectSoundEventAnnotation}
                  onAddTag={(tag) =>
                    isMultiSelect
                      ? handleReplaceTagInSoundEventAnnotations(null, tag)
                      : activeAddTagToSoundEventAnnotation?.({
                          soundEventAnnotation: selectedSoundEventAnnotation,
                          tag,
                        })
                  }
                  onRemoveTag={(tag) =>
                    isMultiSelect
                      ? handleDeleteTagFromAll({ tag, count: 0 }, true)
                      : activeRemoveTagFromSoundEventAnnotation?.({
                          soundEventAnnotation: selectedSoundEventAnnotation,
                          tag,
                        })
                  }
                />
              </div>
            )}
            </div>
            {displayAnnotationTask != null && (
              <div className="min-w-0" data-guided-tour="tag-bars">
                <AnnotationTaskTags
                  annotationTask={displayAnnotationTask}
                  onReplaceTagInSoundEventAnnotations={handleReplaceTagInSoundEventAnnotations}
                  onReplaceGroupInSoundEventAnnotations={handleReplaceGroupInSoundEventAnnotations}
                  onAddTagToUntaggedSoundEventAnnotations={handleAddTagToUntaggedSoundEventAnnotations}
                  onAddTagToSoundEventAnnotationsWithTag={handleAddTagToSoundEventAnnotationsWithTag}
                  selectedSoundEventAnnotation={selectedSoundEventAnnotation}
                  selectedSoundEventAnnotations={isMultiSelect ? multiSelectedSoundEventAnnotations : undefined}
                  tagVisibility={tagVisibility}
                />
              </div>
            )}
          </div>
        )}
        {!fullscreen && annotationTask != null && (
          <div className="flex min-w-0 flex-col gap-4 xl:col-start-1 xl:row-start-2 2xl:col-start-2">
            <div data-guided-tour="task-tags">
              <AnnotationTaskTagBar
                annotationTask={annotationTask}
                onAddTag={onAddTag}
                onRemoveTag={onRemoveTag}
              />
            </div>
            <div data-guided-tour="task-notes">
              <AnnotationTaskNotes
                onCreateNote={onAddNote}
                onDeleteNote={onRemoveNote}
                annotationTask={annotationTask}
                currentUser={currentUser}
              />
            </div>
          </div>
        )}
      </div>
      {fullscreen && displayAnnotationTask != null && (
        <AnnotationTaskTags
          headless
          annotationTask={displayAnnotationTask}
          onReplaceTagInSoundEventAnnotations={handleReplaceTagInSoundEventAnnotations}
          onReplaceGroupInSoundEventAnnotations={handleReplaceGroupInSoundEventAnnotations}
          onAddTagToUntaggedSoundEventAnnotations={handleAddTagToUntaggedSoundEventAnnotations}
          onAddTagToSoundEventAnnotationsWithTag={handleAddTagToSoundEventAnnotationsWithTag}
          selectedSoundEventAnnotation={selectedSoundEventAnnotation}
          selectedSoundEventAnnotations={isMultiSelect ? multiSelectedSoundEventAnnotations : undefined}
          tagVisibility={tagVisibility}
        />
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
                          Select a tag to remove from {isMultiSelect ? `the ${multiSelectedSoundEventAnnotations.length} selected sound events` : selectedSoundEventAnnotation ? 'selected sound event annotation' : 'all sound event annotations'}
                        </div>
                        <SearchMenu
                          limit={100}
                          options={isMultiSelect
                            ? countTags(multiSelectedSoundEventAnnotations)
                            : selectedSoundEventAnnotation
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

      {untaggedWarning != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/30">
          <div
            role="dialog"
            aria-label="Untagged sound events"
            className="w-96 rounded-md border border-stone-200 bg-stone-50 p-4 shadow-md dark:border-stone-500 dark:bg-stone-700"
          >
            <div className="mb-2 text-stone-700 underline decoration-amber-500 decoration-2 underline-offset-2 dark:text-stone-300">
              Untagged sound events
            </div>
            <p className="mb-4 text-sm text-stone-600 dark:text-stone-300">
              {untaggedWarning.untagged.length === 1
                ? "1 sound event in this task has no tag."
                : `${untaggedWarning.untagged.length} sound events in this task have no tag.`}{" "}
              {untaggedWarning.label} the task anyway?
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => showUntagged(untaggedWarning.untagged)}>
                Show untagged
              </Button>
              <Button
                variant="primary"
                autoFocus
                onClick={() => {
                  const { proceed } = untaggedWarning;
                  setUntaggedWarning(null);
                  proceed();
                }}
              >
                {untaggedWarning.label} anyway
              </Button>
            </div>
          </div>
        </div>
      )}

      {tasks.filterMismatchTaskId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/30">
          <div
            role="dialog"
            aria-label="Task not in filter"
            className="w-96 rounded-md bg-stone-50 dark:bg-stone-700 border border-stone-200 dark:border-stone-500 shadow-md p-4"
          >
            <div className="mb-2 text-stone-700 dark:text-stone-300 underline underline-offset-2 decoration-amber-500 decoration-2">
              Task not in current filter
            </div>
            <p className="mb-4 text-sm text-stone-600 dark:text-stone-300">
              The task you opened is not matched by the active filter. Use the
              filter to continue with its first task, or keep the original task.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={tasks.keepOriginalTask}>
                Show original task
              </Button>
              <Button variant="primary" onClick={tasks.applyFilterForMismatch}>
                Use filter
              </Button>
            </div>
          </div>
        </div>
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
                              emitGuidedTourEvent("cycle-tag-selected");
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
    </>
  );
}

function NoTaskSelected() {
  return <Empty>No task selected</Empty>;
}
