"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useContext, useMemo } from "react";
import toast from "react-hot-toast";
import { HOST } from "@/api/common";
import { AxiosError } from "axios";

import UserContext from "@/app/(base)/context";
import AnnotateTasks from "@/components/annotation_tasks/AnnotateTasks";
import Loading from "@/components/Loading";
import { CompleteIcon, NeedsReviewIcon, HelpIcon, VerifiedIcon } from "@/components/icons";
import useAnnotationTask from "@/hooks/api/useAnnotationTask";
import useAnnotationHistory from "@/hooks/annotation/useAnnotationHistory";
import useStore from "@/store";
import { SpectrogramParametersSchema } from "@/schemas";

import AnnotationProjectContext from "../context";

import type { AnnotationTask, AnnotationStatus, Geometry, SpectrogramParameters, SoundEventAnnotation, Tag } from "@/types";
import type { NoteCreate } from "@/api/notes";

export default function Page() {
  const search = useSearchParams();
  // This is a bug in nextjs. usePathname() should already return the correct
  // path, but it does not. So we use this workaround...
  const pathname = HOST + usePathname();
  const router = useRouter();

  const project = useContext(AnnotationProjectContext);
  const user = useContext(UserContext);

  const annotationTaskID = search.get("annotation_task_id");
  const sourceAnnotationTaskID = search.get("source_annotation_task_id");


  // All hooks must be called before any conditional returns
  const handleError = useCallback((error: AxiosError) => {
    toast.error(error.message)
  }, []);

  const annotationTaskQuery = useAnnotationTask({
    id: annotationTaskID ? parseInt(annotationTaskID) : 0,
    enabled: !!annotationTaskID,
    onError: handleError,
    include_recording: true,
    include_notes: true,
    include_sound_event_annotations: true,  // Full sound events needed here
    include_tags: true,
    include_features: true,
    include_status_badges: true,
    include_status_badge_users: true,
    include_note_users: true,  // For note author display
  });

  // Extract data and mutation functions
  const {
    data: annotationTask,
    isLoading: isLoadingTask,
    addNote,
    removeNote,
    addBadge,
    removeBadge,
    addTag,
    removeTag,
    addTagToSoundEventAnnotation,
    removeTagFromSoundEventAnnotation,
    addSoundEventAnnotation,
    removeSoundEventAnnotation,
    updateSoundEventAnnotation,
  } = annotationTaskQuery;

  const parsedSourceTaskId = sourceAnnotationTaskID
    ? parseInt(sourceAnnotationTaskID, 10)
    : 0;

  const sourceAnnotationTaskQuery = useAnnotationTask({
    id: parsedSourceTaskId,
    enabled: !!sourceAnnotationTaskID && !Number.isNaN(parsedSourceTaskId),
    onError: handleError,
    include_recording: true,
    include_sound_event_annotations: true,
    include_tags: true,
    include_sound_event_tags: true,
  });

  const {
    data: sourceAnnotationTask,
    addSoundEventAnnotation: sourceAddSoundEventAnnotation,
    removeSoundEventAnnotation: sourceRemoveSoundEventAnnotation,
    updateSoundEventAnnotation: sourceUpdateSoundEventAnnotation,
    addTagToSoundEventAnnotation: sourceAddTagToSoundEventAnnotation,
    removeTagFromSoundEventAnnotation: sourceRemoveTagFromSoundEventAnnotation,
  } = sourceAnnotationTaskQuery;

  const currentHistoryMutations = useMemo(
    () => ({
      addSoundEventAnnotation: (params: { geometry: Geometry; tags: Tag[] }) =>
        addSoundEventAnnotation.mutateAsync(params),
      removeSoundEventAnnotation: (annotation: SoundEventAnnotation) =>
        removeSoundEventAnnotation.mutateAsync(annotation),
      updateSoundEventAnnotation: (params: {
        soundEventAnnotation: SoundEventAnnotation;
        geometry: Geometry;
      }) => updateSoundEventAnnotation.mutateAsync(params),
      addTagToSoundEventAnnotation: (params: {
        soundEventAnnotation: SoundEventAnnotation;
        tag: Tag;
      }) => addTagToSoundEventAnnotation.mutateAsync(params),
      removeTagFromSoundEventAnnotation: (params: {
        soundEventAnnotation: SoundEventAnnotation;
        tag: Tag;
      }) => removeTagFromSoundEventAnnotation.mutateAsync(params),
      addTaskTag: (tag: Tag) => addTag.mutateAsync(tag),
      removeTaskTag: (tag: Tag) => removeTag.mutateAsync(tag),
    }),
    [
      addSoundEventAnnotation,
      removeSoundEventAnnotation,
      updateSoundEventAnnotation,
      addTagToSoundEventAnnotation,
      removeTagFromSoundEventAnnotation,
      addTag,
      removeTag,
    ],
  );

  const sourceHistoryMutations = useMemo(
    () => ({
      addSoundEventAnnotation: (params: { geometry: Geometry; tags: Tag[] }) =>
        sourceAddSoundEventAnnotation.mutateAsync(params),
      removeSoundEventAnnotation: (annotation: SoundEventAnnotation) =>
        sourceRemoveSoundEventAnnotation.mutateAsync(annotation),
      updateSoundEventAnnotation: (params: {
        soundEventAnnotation: SoundEventAnnotation;
        geometry: Geometry;
      }) => sourceUpdateSoundEventAnnotation.mutateAsync(params),
      addTagToSoundEventAnnotation: (params: {
        soundEventAnnotation: SoundEventAnnotation;
        tag: Tag;
      }) => sourceAddTagToSoundEventAnnotation.mutateAsync(params),
      removeTagFromSoundEventAnnotation: (params: {
        soundEventAnnotation: SoundEventAnnotation;
        tag: Tag;
      }) => sourceRemoveTagFromSoundEventAnnotation.mutateAsync(params),
      addTaskTag: async () => undefined,
      removeTaskTag: async () => undefined,
    }),
    [
      sourceAddSoundEventAnnotation,
      sourceRemoveSoundEventAnnotation,
      sourceUpdateSoundEventAnnotation,
      sourceAddTagToSoundEventAnnotation,
      sourceRemoveTagFromSoundEventAnnotation,
    ],
  );

  const annotationHistory = useAnnotationHistory({
    taskId: annotationTask?.id,
    soundEventAnnotations: annotationTask?.sound_event_annotations ?? undefined,
    mutations: currentHistoryMutations,
  });

  const sourceAnnotationHistory = useAnnotationHistory({
    taskId: sourceAnnotationTask?.id,
    soundEventAnnotations: sourceAnnotationTask?.sound_event_annotations ?? undefined,
    mutations: sourceHistoryMutations,
  });

  const parameters = useStore((state) => state.spectrogramSettings);

  const setParameters = useStore((state) => state.setSpectrogramSettings);

  const onParameterSave = useCallback(
    (parameters: SpectrogramParameters) => {
      try {
        // Validate before saving
        SpectrogramParametersSchema.parse(parameters);
        setParameters(parameters);
      } catch (error) {
        toast.error("Invalid spectrogram parameters. Please check your settings.");
      }
    },
    [setParameters],
  );

  // Wrap mutation functions in useCallback for reference stability
  const handleAddNote = useCallback(
    (note: NoteCreate) => addNote.mutate(note),
    [addNote]
  );

  const handleRemoveNote = useCallback(
    (note: any) => removeNote.mutate(note),
    [removeNote]
  );

  const handleAddTag = useCallback(
    (tag: Tag) => annotationHistory.wrapAddTaskTag(tag),
    [annotationHistory],
  );

  const handleRemoveTag = useCallback(
    (tag: Tag) => annotationHistory.wrapRemoveTaskTag(tag),
    [annotationHistory],
  );

  const handleAddTagToSoundEventAnnotation = useCallback(
    (params: {
      soundEventAnnotation: SoundEventAnnotation;
      tag: Tag;
    }) => annotationHistory.wrapAddTagToSoundEventAnnotation(params),
    [annotationHistory],
  );

  const handleRemoveTagFromSoundEventAnnotation = useCallback(
    (params: {
      soundEventAnnotation: SoundEventAnnotation;
      tag: Tag;
    }) => annotationHistory.wrapRemoveTagFromSoundEventAnnotation(params),
    [annotationHistory],
  );

  const handleAddSoundEventAnnotation = useCallback(
    (params: { geometry: Geometry; tags: Tag[] }) =>
      annotationHistory.wrapAddSoundEventAnnotation(params),
    [annotationHistory],
  );

  const handleRemoveSoundEventAnnotation = useCallback(
    (annotation: SoundEventAnnotation) =>
      annotationHistory.wrapRemoveSoundEventAnnotation(annotation),
    [annotationHistory],
  );

  const handleUpdateSoundEventAnnotation = useCallback(
    (params: {
      soundEventAnnotation: SoundEventAnnotation;
      geometry: Geometry;
    }) => annotationHistory.wrapUpdateSoundEventAnnotation(params),
    [annotationHistory],
  );

  const handleSourceAddSoundEventAnnotation = useCallback(
    (params: { geometry: Geometry; tags: Tag[] }) =>
      sourceAnnotationHistory.wrapAddSoundEventAnnotation(params),
    [sourceAnnotationHistory],
  );

  const handleSourceRemoveSoundEventAnnotation = useCallback(
    (annotation: SoundEventAnnotation) =>
      sourceAnnotationHistory.wrapRemoveSoundEventAnnotation(annotation),
    [sourceAnnotationHistory],
  );

  const handleSourceUpdateSoundEventAnnotation = useCallback(
    (params: {
      soundEventAnnotation: SoundEventAnnotation;
      geometry: Geometry;
    }) => sourceAnnotationHistory.wrapUpdateSoundEventAnnotation(params),
    [sourceAnnotationHistory],
  );

  const handleSourceAddTagToSoundEventAnnotation = useCallback(
    (params: {
      soundEventAnnotation: SoundEventAnnotation;
      tag: Tag;
    }) => sourceAnnotationHistory.wrapAddTagToSoundEventAnnotation(params),
    [sourceAnnotationHistory],
  );

  const handleSourceRemoveTagFromSoundEventAnnotation = useCallback(
    (params: {
      soundEventAnnotation: SoundEventAnnotation;
      tag: Tag;
    }) => sourceAnnotationHistory.wrapRemoveTagFromSoundEventAnnotation(params),
    [sourceAnnotationHistory],
  );

  const handleAddBadge = useCallback(
    async (task: AnnotationTask, state: AnnotationStatus) => {
      const result = await addBadge.mutateAsync(state);
      return result;
    },
    [addBadge]
  );
  
  const handleRemoveBadge = useCallback(
    async (task: AnnotationTask, state: AnnotationStatus, userId?: string) => {
      const result = await removeBadge.mutateAsync(state);
      return result;
    },
    [removeBadge]
  );

  const onChangeTask = useCallback(
    (task: AnnotationTask) => {
      const url = new URL(pathname, window.location.origin);
      const params = new URLSearchParams(search);
      params.set("annotation_task_id", task.id.toString());
      params.delete("source_annotation_task_id");
      router.push(`${url.toString()}?${params.toString()}`);
    },
    [router, pathname, search],
  );

  const onSourceTaskChange = useCallback(
    (sourceTaskId: number | null) => {
      const url = new URL(pathname, window.location.origin);
      const params = new URLSearchParams(search);
      if (sourceTaskId == null) {
        params.delete("source_annotation_task_id");
      } else {
        params.set("source_annotation_task_id", sourceTaskId.toString());
      }
      router.push(`${url.toString()}?${params.toString()}`);
    },
    [router, pathname, search],
  );

  const handleCompleteTask = useCallback(() => {
    toast(
      <span className="flex items-center gap-2">
        <CompleteIcon className="w-5 h-5 text-emerald-500" />
        <span>Accepted</span>
      </span>
    );
  }, []);

  const handleUnsureTask = useCallback(() => {
    toast(
      <span className="flex items-center gap-2">
        <HelpIcon className="w-5 h-5 text-amber-500" />
        <span>Unsure</span>
      </span>
    );
  }, []);

  const handleRejectTask = useCallback(() => {
    toast(
      <span className="flex items-center gap-2">
        <NeedsReviewIcon className="w-5 h-5 text-red-500" />
        <span>Rejected</span>
      </span>
    );
  }, []);

  const handleVerifyTask = useCallback(() => {
    toast(
      <span className="flex items-center gap-2">
        <VerifiedIcon className="w-5 h-5 text-blue-500" />
        <span>Verified</span>
      </span>
    );
  }, []);

  const filter = useMemo(
    () => ({
      annotation_project: project,
    }),
    [project],
  );

  // Now handle conditional cases after all hooks have been called
  if (annotationTaskID == null) {
    toast.error("Annotation task not found.");
    router.back()
    return null;
  }

  if (isLoadingTask && !annotationTask) {
    return <Loading />;
  }

  return (
    <div className="w-full">
      <AnnotateTasks
        taskFilter={filter}
        annotationTask={annotationTask}
        isLoadingTask={isLoadingTask}
        parameters={parameters}
        onChangeTask={onChangeTask}
        currentUser={user}
        onParameterSave={onParameterSave}
        onCompleteTask={handleCompleteTask}
        onUnsureTask={handleUnsureTask}
        onRejectTask={handleRejectTask}
        onVerifyTask={handleVerifyTask}
        onAddBadge={handleAddBadge}
        onRemoveBadge={handleRemoveBadge}
        onAddNote={handleAddNote}
        onRemoveNote={handleRemoveNote}
        onAddTag={handleAddTag}
        onRemoveTag={handleRemoveTag}
        onAddTagToSoundEventAnnotation={handleAddTagToSoundEventAnnotation}
        onRemoveTagFromSoundEventAnnotation={handleRemoveTagFromSoundEventAnnotation}
        onAddSoundEventAnnotation={handleAddSoundEventAnnotation}
        onRemoveSoundEventAnnotation={handleRemoveSoundEventAnnotation}
        onUpdateSoundEventAnnotation={handleUpdateSoundEventAnnotation}
        sourceTaskId={
          sourceAnnotationTaskID && !Number.isNaN(parsedSourceTaskId)
            ? parsedSourceTaskId
            : null
        }
        onSourceTaskChange={onSourceTaskChange}
        sourceAnnotationTask={sourceAnnotationTask}
        onSourceAddSoundEventAnnotation={handleSourceAddSoundEventAnnotation}
        onSourceRemoveSoundEventAnnotation={handleSourceRemoveSoundEventAnnotation}
        onSourceUpdateSoundEventAnnotation={handleSourceUpdateSoundEventAnnotation}
        onSourceAddTagToSoundEventAnnotation={handleSourceAddTagToSoundEventAnnotation}
        onSourceRemoveTagFromSoundEventAnnotation={handleSourceRemoveTagFromSoundEventAnnotation}
        annotationHistory={{
          canUndo: annotationHistory.canUndo,
          canRedo: annotationHistory.canRedo,
          undoLabel: annotationHistory.undoLabel,
          redoLabel: annotationHistory.redoLabel,
          undo: annotationHistory.undo,
          redo: annotationHistory.redo,
          runBatch: annotationHistory.runBatch,
        }}
        sourceAnnotationHistory={{
          canUndo: sourceAnnotationHistory.canUndo,
          canRedo: sourceAnnotationHistory.canRedo,
          undoLabel: sourceAnnotationHistory.undoLabel,
          redoLabel: sourceAnnotationHistory.redoLabel,
          undo: sourceAnnotationHistory.undo,
          redo: sourceAnnotationHistory.redo,
          runBatch: sourceAnnotationHistory.runBatch,
        }}
      />
    </div>
  );
}
