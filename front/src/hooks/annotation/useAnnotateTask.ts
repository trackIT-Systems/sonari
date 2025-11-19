import { useCallback, useMemo, useState, useEffect } from "react";

import useAnnotationCreate from "@/hooks/annotation/useAnnotationCreate";
import useAnnotationDelete from "@/hooks/annotation/useAnnotationDelete";
import useAnnotationDraw from "@/hooks/annotation/useAnnotationDraw";
import useAnnotationEdit from "@/hooks/annotation/useAnnotationEdit";
import useAnnotationSelect from "@/hooks/annotation/useAnnotationSelect";
import useSpectrogramTags from "@/hooks/spectrogram/useSpectrogramTags";
import useAnnotateTaskKeyShortcuts from "@/hooks/annotation/useSoundEventAnnotationKeyShortcuts";
import useCreateWaveformMeasurement from "@/hooks/draw/useCreateWaveformMeasurement";

import { ABORT_SHORTCUT } from "@/utils/keyboard";

import type {
  Geometry,
  GeometryType,
  LineString,
  SoundEventAnnotation,
  SpectrogramWindow,
  Tag,
  AnnotationTask,
} from "@/types";
import toast from "react-hot-toast";

export type AnnotateMode = "select" | "measure" | "draw" | "edit" | "delete" | "idle";

type DrawFunction = (ctx: CanvasRenderingContext2D) => void;

const getStartCoordinate = (geometry: Geometry) => {
  switch (geometry.type) {
    case "BoundingBox":
      return geometry.coordinates[0];

    case "TimeInterval":
      return geometry.coordinates[0];

    default:
      throw new Error(`Unsupported geometry type: ${geometry.type}`);
  }
}

const getEndCoordinate = (geometry: Geometry) => {
  switch (geometry.type) {
    case "BoundingBox":
      return geometry.coordinates[2];

    case "TimeInterval":
      return geometry.coordinates[1];

    default:
      throw new Error(`Unsupported geometry type: ${geometry.type}`);
  }
}

const sortSoundEvents = (soundEvents: SoundEventAnnotation[]) => {
  return [...soundEvents].sort((a, b) => {
    const startA = getStartCoordinate(a.geometry);
    const startB = getStartCoordinate(b.geometry);
    return startA - startB;
  });
};

export default function useAnnotateTask(props: {
  /** The annotation task to annotate */
  annotationTask?: AnnotationTask;
  /** Current spectrogram window */
  window: SpectrogramWindow;
  /** Canvas ref for scaling tag positions */
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
  /** Initial annotation mode */
  mode?: AnnotateMode;
  /** Tags to add to new sound event annotations by default */
  defaultTags?: Tag[];
  selectedTag: { tag: Tag; count: number } | null
  /** Whether the annotation actions are active or not. The active state is
   * used to temporarily disable the annotation actions when other spectrogram
   * actions are active (e.g. zoom, pan, etc.)
   */
  active?: boolean;
  /** Whether annotation (create, edit, delete) actions are permanently
   * disabled or not */
  disabled?: boolean;
  /** Whether to show sound events or not */
  withSoundEvent?: boolean;
  /** Callback when the selected annotation changes */
  onSelectSoundEventAnnotation?: (annotation: SoundEventAnnotation | null) => void;
  /** Callback when the annotation mode (idle, create, delete, select, draw)
   * changes */
  onModeChange?: (mode: AnnotateMode) => void;
  /** Callback when an annotation is deselected */
  onDeselect?: () => void;
  onCenterOn: (time: number) => void;
  /** Mutation callbacks */
  onAddSoundEventAnnotation?: (params: { geometry: Geometry; tags: Tag[] }) => Promise<SoundEventAnnotation>;
  onRemoveSoundEventAnnotation?: (annotation: SoundEventAnnotation) => void;
  onUpdateSoundEventAnnotation?: (params: { soundEventAnnotation: SoundEventAnnotation; geometry: Geometry }) => void;
  onAddTagToSoundEventAnnotation?: (params: { soundEventAnnotation: SoundEventAnnotation; tag: Tag }) => Promise<SoundEventAnnotation>;
  onRemoveTagFromSoundEventAnnotation?: (params: { soundEventAnnotation: SoundEventAnnotation; tag: Tag }) => Promise<SoundEventAnnotation>;
}) {
  const {
    annotationTask,
    window,
    canvasRef,
    defaultTags,
    selectedTag,
    mode: initialMode = "select",
    active = true,
    disabled = false,
    withSoundEvent = true,
    onModeChange,
    onSelectSoundEventAnnotation,
    onDeselect,
    onCenterOn,
    onAddSoundEventAnnotation,
    onRemoveSoundEventAnnotation,
    onUpdateSoundEventAnnotation,
    onAddTagToSoundEventAnnotation,
    onRemoveTagFromSoundEventAnnotation,
  } = props;

  const {
    mode,
    geometryType,
    selectedSoundEventAnnotation,
    setMode,
    setGeometryType,
    setSelectedSoundEventAnnotation,
  } = useAnnotateTaskState({
    mode: initialMode,
    geometryType: "BoundingBox",
    onSelectSoundEventAnnotation,
    onChangeMode: onModeChange,
  });

  // Extract sound events with safe default - all hooks must be called before any conditional returns
  const soundEvents = useMemo(
    () => {
      if (withSoundEvent && annotationTask) {
        return annotationTask.sound_event_annotations || []
      } else {
        return []
      }
    },
    [annotationTask, withSoundEvent],
  );

  const handleCreate = useCallback(
    async (geometry: Geometry) => {
      if (disabled || !onAddSoundEventAnnotation) return;
      try {
        const data = await onAddSoundEventAnnotation({
          geometry,
          tags: defaultTags || [],
        });
        setSelectedSoundEventAnnotation(data);
      } catch (error) {
        console.error('Error creating sound event annotation:', error);
      }
    },
    [defaultTags, onAddSoundEventAnnotation, disabled, setSelectedSoundEventAnnotation],
  );

  // State to track measurements from different sources
  const [spectrogramMeasurement, setSpectrogramMeasurement] = useState<LineString | null>(null);
  const [measurementSource, setMeasurementSource] = useState<"spectrogram" | "waveform" | null>(null);
  const [activeMeasurementCanvas, setActiveMeasurementCanvas] = useState<"spectrogram" | "waveform" | null>(null);

  // Measurement hook for spectrogram - measurements here will be reflected in waveform
  const { props: spectrogramMeasureProps, draw: drawSpectrogramMeasure } = useAnnotationCreate({
    window,
    geometryType: "LineString",
    enabled: active && mode === "measure" && !disabled && (activeMeasurementCanvas === null || activeMeasurementCanvas === "spectrogram"),
    onCreate: (geometry: Geometry) => {
      if (geometry.type === "LineString") {
        // Store spectrogram measurements to show in both canvases
        setSpectrogramMeasurement(geometry);
        setMeasurementSource("spectrogram");
        setActiveMeasurementCanvas(null); // Reset after measurement complete
      }
    },
  });

  // Add mouse event handlers to detect which canvas starts the measurement
  const handleSpectrogramMeasureStart = useCallback(() => {
    if (mode === "measure" && activeMeasurementCanvas === null) {
      setActiveMeasurementCanvas("spectrogram");
    }
  }, [mode, activeMeasurementCanvas]);

  const handleWaveformMeasureStart = useCallback(() => {
    if (mode === "measure" && activeMeasurementCanvas === null) {
      setActiveMeasurementCanvas("waveform");
    }
  }, [mode, activeMeasurementCanvas]);

  // Enhanced spectrogram props with measurement detection
  const enhancedSpectrogramMeasureProps = useMemo(() => ({
    ...spectrogramMeasureProps,
    onMouseDown: (e: React.MouseEvent) => {
      handleSpectrogramMeasureStart();
      spectrogramMeasureProps?.onMouseDown?.(e);
    },
  }), [spectrogramMeasureProps, handleSpectrogramMeasureStart]);

  // Measurement hook for waveform - measurements here stay only in waveform
  const { props: waveformMeasureProps, draw: drawWaveformMeasure } = useCreateWaveformMeasurement({
    window,
    enabled: active && mode === "measure" && !disabled && (activeMeasurementCanvas === null || activeMeasurementCanvas === "waveform"),
    onCreate: (geometry: Geometry) => {
      // Only clear spectrogram measurement if this was actually a waveform interaction
      setSpectrogramMeasurement(null);
      setMeasurementSource("waveform");
      setActiveMeasurementCanvas(null); // Reset after measurement complete
    },
  });

  // Enhanced waveform props with measurement detection
  const enhancedWaveformMeasureProps = useMemo(() => ({
    ...waveformMeasureProps,
    onMouseDown: (e: React.MouseEvent) => {
      handleWaveformMeasureStart();
      waveformMeasureProps?.onMouseDown?.(e);
    },
  }), [waveformMeasureProps, handleWaveformMeasureStart]);

  const { props: createProps, draw: drawCreate } = useAnnotationCreate({
    window,
    geometryType,
    enabled: active && mode === "draw" && !disabled,
    onCreate: handleCreate,
  });

  const { props: selectProps, draw: drawSelect } = useAnnotationSelect({
    window,
    annotations: soundEvents,
    onSelect: setSelectedSoundEventAnnotation,
    onDeselect,
    enabled: active && mode === "select",
  });

    useEffect(() => {
      const handleKeyPress = (event: KeyboardEvent) => {
        if (event.key === ABORT_SHORTCUT) {
          onSelectSoundEventAnnotation?.(null);
          onDeselect?.()
          setMode("idle")
          return;
        }
      };
  
      document.addEventListener('keydown', handleKeyPress);
      return () => document.removeEventListener('keydown', handleKeyPress);
    }, [onDeselect, onSelectSoundEventAnnotation, setMode]);

  const handleDelete = useCallback(
    (annotation: SoundEventAnnotation) => {
      if (disabled || !onRemoveSoundEventAnnotation) return;
      onRemoveSoundEventAnnotation(annotation);
      setMode("idle");
    },
    [onRemoveSoundEventAnnotation, setMode, disabled],
  );

  const { props: deleteProps, draw: drawDelete } = useAnnotationDelete({
    window,
    annotations: soundEvents,
    onDelete: handleDelete,
    onDeselect,
    enabled: active && mode === "delete" && !disabled,
  });

  const handleEdit = useCallback(
    (geometry: Geometry) => {
      if (selectedSoundEventAnnotation == null || disabled || !onUpdateSoundEventAnnotation) return;
      onUpdateSoundEventAnnotation({
        soundEventAnnotation: selectedSoundEventAnnotation,
        geometry,
      });
    },
    [selectedSoundEventAnnotation, onUpdateSoundEventAnnotation, disabled],
  );

  const handleCopy = useCallback(
    async (soundEventAnnotation: SoundEventAnnotation, geometry: Geometry) => {
      if (disabled || !onAddSoundEventAnnotation) return;
      try {
        const data = await onAddSoundEventAnnotation({
          geometry,
          tags: soundEventAnnotation.tags || [],
        });
        setSelectedSoundEventAnnotation(data);
      } catch (error) {
        console.error('Error copying sound event annotation:', error);
      }
    },
    [onAddSoundEventAnnotation, setSelectedSoundEventAnnotation, disabled],
  );

  const filteredSoundEvents = useMemo(() => {
    if (!selectedTag) {
      return soundEvents;
    }
    return soundEvents.filter(event =>
      event.tags?.some(tag => tag.key === selectedTag.tag.key && tag.value === selectedTag.tag.value)
    );
  }, [soundEvents, selectedTag]);

  const selectNextAnnotation = useCallback(() => {
    if (!filteredSoundEvents.length) return;
  
    const sortedAnnotations = sortSoundEvents(filteredSoundEvents);
  
    const currentIndex = sortedAnnotations.findIndex(
      (annotation) => annotation.id === selectedSoundEventAnnotation?.id
    );
  
    const nextIndex = currentIndex === -1 
      ? 0  // If no current selection, start from beginning
      : (currentIndex + 1) % sortedAnnotations.length;
  
    const nextAnnotation = sortedAnnotations[nextIndex];
    setSelectedSoundEventAnnotation(nextAnnotation);
    onSelectSoundEventAnnotation?.(nextAnnotation);
  
    // Assume `centerOn` is a function provided by the spectrogram to adjust the window.
    if (window && nextAnnotation) {
      const annotationStart = getStartCoordinate(nextAnnotation.geometry);
      const annotationEnd = getEndCoordinate(nextAnnotation.geometry);
  
      // Check if annotation is outside window:
      if (annotationStart < window.time.min || annotationEnd > window.time.max) {
        // Calculate the new center position
        const newCenterTime = (annotationStart + annotationEnd) / 2;
        onCenterOn(newCenterTime);
      }
    }
  }, [filteredSoundEvents, selectedSoundEventAnnotation, onSelectSoundEventAnnotation, onCenterOn, window, setSelectedSoundEventAnnotation]);

  const selectPrevAnnotation = useCallback(() => {
    if (!filteredSoundEvents.length) return;
  
    const sortedAnnotations = sortSoundEvents(filteredSoundEvents);
  
    const currentIndex = sortedAnnotations.findIndex(
      (annotation) => annotation.id === selectedSoundEventAnnotation?.id
    );
  
    const prevIndex = currentIndex === -1 
      ? sortedAnnotations.length - 1  // If no current selection, start from end
      : (currentIndex - 1 + sortedAnnotations.length) % sortedAnnotations.length;
  
    const nextAnnotation = sortedAnnotations[prevIndex];
    setSelectedSoundEventAnnotation(nextAnnotation);
    onSelectSoundEventAnnotation?.(nextAnnotation);
  
    // Assume `centerOn` is a function provided by the spectrogram to adjust the window.
    if (window && nextAnnotation) {
      const annotationStart = getStartCoordinate(nextAnnotation.geometry);
      const annotationEnd = getEndCoordinate(nextAnnotation.geometry);
  
      // Check if annotation is outside window:
      if (annotationStart < window.time.min || annotationEnd > window.time.max) {
        // Calculate the new center position
        const newCenterTime = (annotationStart + annotationEnd) / 2;
        onCenterOn(newCenterTime);
      }
    }
  }, [filteredSoundEvents, selectedSoundEventAnnotation, onSelectSoundEventAnnotation, onCenterOn, window, setSelectedSoundEventAnnotation]);

  const { props: editProps, draw: drawEdit } = useAnnotationEdit({
    window,
    annotation: selectedSoundEventAnnotation,
    onDeselect,
    onEdit: handleEdit,
    onCopy: handleCopy,
    enabled: active && mode === "edit" && !disabled,
  });

  const handleOnClickTag = useCallback(
    async (annotation: SoundEventAnnotation, tag: Tag) => {
      if (disabled || !onRemoveTagFromSoundEventAnnotation) return;
      try {
        await onRemoveTagFromSoundEventAnnotation({
          soundEventAnnotation: annotation,
          tag,
        });
      } catch (error) {
        console.error('Error removing tag from sound event:', error);
      }
    },
    [onRemoveTagFromSoundEventAnnotation, disabled],
  );

  const handleOnAddTag = useCallback(
    async (annotation: SoundEventAnnotation, tag: Tag) => {
      if (disabled || !onAddTagToSoundEventAnnotation) return;
      try {
        await onAddTagToSoundEventAnnotation({
          soundEventAnnotation: annotation,
          tag,
        });
      } catch (error) {
        console.error('Error adding tag to sound event:', error);
      }
    },
    [onAddTagToSoundEventAnnotation, disabled],
  );

  const tags = useSpectrogramTags({
    annotations: soundEvents,
    window,
    canvasRef,
    onClickTag: handleOnClickTag,
    onAddTag: handleOnAddTag,
    active: mode !== "draw" && mode !== "delete",
    disabled,
  });

  const drawAnnotations = useAnnotationDraw({
    window,
    annotations: soundEvents,
  });

  // Create props objects for spectrogram and waveform
  let spectrogramProps = {};
  let waveformProps = {};
  
  if (active) {
    switch (mode) {
      case "select":
        spectrogramProps = selectProps;
        waveformProps = selectProps;
        break;
      case "delete":
        spectrogramProps = deleteProps;
        waveformProps = deleteProps;
        break;
      case "measure":
        // Both canvases get measurement props with enhanced detection
        spectrogramProps = enhancedSpectrogramMeasureProps;
        waveformProps = enhancedWaveformMeasureProps;
        break;
      case "draw":
        spectrogramProps = createProps;
        waveformProps = {};
        break;
      case "edit":
        spectrogramProps = editProps;
        waveformProps = {};
        break;
      default:
        spectrogramProps = {};
        waveformProps = {};
    }
  }

  // Create separate draw functions for spectrogram and waveform
  const drawSpectrogram = useMemo(() => {
    if (!active) return drawAnnotations;

    const otherDraw: DrawFunction = {
      select: drawSelect,
      delete: drawDelete,
      edit: drawEdit,
      draw: drawCreate,
      measure: drawSpectrogramMeasure,
      idle: () => undefined,
    }[mode];

    return (ctx: CanvasRenderingContext2D) => {
      drawAnnotations(ctx);
      otherDraw(ctx);
    };
  }, [
    active,
    mode,
    drawAnnotations,
    drawSpectrogramMeasure,
    drawCreate,
    drawSelect,
    drawDelete,
    drawEdit,
  ]);

  const drawWaveform = useMemo(() => {
    const otherDraw: DrawFunction = {
      select: () => {},
      delete: () => {},
      edit: () => {},
      draw: () => {},
      measure: drawWaveformMeasure,
      idle: () => undefined,
    }[mode];

    return (ctx: CanvasRenderingContext2D) => {
      // Draw any time bounds from spectrogram measurements (persist even when not actively measuring)
      if (spectrogramMeasurement && measurementSource === "spectrogram") {
        drawSpectrogramMeasurementBounds(ctx, spectrogramMeasurement, window);
      }
      otherDraw(ctx);
    };
  }, [
    mode,
    spectrogramMeasurement,
    measurementSource,
    drawWaveformMeasure,
    window,
  ]);

  const enableDelete = useCallback(() => {
    setMode("delete");
  }, [setMode]);

  const enableSelect = useCallback(() => {
    setMode("select");
  }, [setMode]);

  const enableMeasure = useCallback(() => {
    setMode("measure");
    setSpectrogramMeasurement(null);
    setMeasurementSource(null);
    setActiveMeasurementCanvas(null);
  }, [setMode]);

  const enableDraw = useCallback(() => {
    setMode("draw");
  }, [setMode]);

  const enableEdit = useCallback(() => {
    setMode("edit");
  }, [setMode]);

  const disable = useCallback(() => {
    setMode("idle");
  }, [setMode]);

  const handleDeleteSelectedSoundEventAnnotations = useCallback(() => {
    if (selectedSoundEventAnnotation && !disabled) {
      handleDelete(selectedSoundEventAnnotation);
    }
  }, [selectedSoundEventAnnotation, handleDelete, disabled]);

  useAnnotateTaskKeyShortcuts({
    onGoMeasure: enableMeasure,
    onGoCreate: enableDraw,
    onGoDelete: enableDelete,
    onGoSelect: enableSelect,
    onGoNext: selectNextAnnotation,
    onGoPrev: selectPrevAnnotation,
    enabled: !disabled,
    selectedSoundEventAnnotation,
    onDeleteSelectedSoundEventAnnotation: handleDeleteSelectedSoundEventAnnotations,
  });

  // All hooks have been called, now check for null values
  if (!annotationTask) {
    toast.error("Annotation task not found.")
    return null
  }

  return {
    mode,
    // Return separate props for each canvas
    spectrogramProps,
    waveformProps,
    // Keep the old props for backward compatibility, defaulting to spectrogram
    props: spectrogramProps,
    // Return separate draw functions
    drawSpectrogram,
    drawWaveform,
    // Keep the old draw for backward compatibility
    draw: drawSpectrogram,
    geometryType,
    selectedSoundEventAnnotation,
    enabled: mode !== "idle" && active,
    isSelecting: mode === "select" && active,
    isMeasuring: mode === "measure" && active,
    isDrawing: mode === "draw" && active,
    isEditing: mode === "edit" && active,
    isDeleting: mode === "delete" && active,
    enableDelete,
    enableSelect,
    enableMeasure,
    enableDraw,
    enableEdit,
    disable,
    setGeometryType,
    tags,
  };
}

function useAnnotateTaskState({
  mode: initialMode = "select",
  geometryType: initialGeometryType = "BoundingBox",
  selectedSoundEventAnnotation: initialSelectedSoundEventAnnotation = null,
  onChangeMode,
  onSelectSoundEventAnnotation,
  onChangeGeometryType,
  disabled = false,
}: {
  mode?: AnnotateMode;
  geometryType?: GeometryType;
  selectedSoundEventAnnotation?: SoundEventAnnotation | null;
  disabled?: boolean;
  onChangeMode?: (mode: AnnotateMode) => void;
  onSelectSoundEventAnnotation?: (annotation: SoundEventAnnotation | null) => void;
  onChangeGeometryType?: (geometryType: GeometryType) => void;
}) {
  const [mode, setMode] = useState<AnnotateMode>(initialMode);
  const [geometryType, setGeometryType] = useState<GeometryType>(initialGeometryType);
  const [selectedSoundEventAnnotation, setSelectedSoundEventAnnotation] = useState<SoundEventAnnotation | null>(initialSelectedSoundEventAnnotation);

  const changeMode = useCallback(
    (mode: AnnotateMode) => {
      if (disabled) {
        if (mode !== "idle" && mode !== "select") {
          throw new Error("Cannot change mode when disabled");
        }
      }
      setMode(mode);
      onChangeMode?.(mode);

      if (mode != "edit" && !disabled) {
        setSelectedSoundEventAnnotation(null);
        onSelectSoundEventAnnotation?.(null);
      }

      if (mode === "idle" && disabled) {
        setSelectedSoundEventAnnotation(null);
        onSelectSoundEventAnnotation?.(null);
      }
    },
    [onChangeMode, onSelectSoundEventAnnotation, setSelectedSoundEventAnnotation, disabled],
  );

  const changeGeometryType = useCallback(
    (geometryType: GeometryType) => {
      setGeometryType(geometryType);
      onChangeGeometryType?.(geometryType);
    },
    [onChangeGeometryType],
  );

  const selectSoundEventAnnotation = useCallback(
    (annotation: SoundEventAnnotation) => {
      setSelectedSoundEventAnnotation(annotation);
      onSelectSoundEventAnnotation?.(annotation);
      if (disabled) return;
      changeMode("edit");
    },
    [onSelectSoundEventAnnotation, changeMode, setSelectedSoundEventAnnotation, disabled],
  );

  return {
    mode,
    geometryType,
    selectedSoundEventAnnotation,
    setMode: changeMode,
    setSelectedSoundEventAnnotation: selectSoundEventAnnotation,
    setGeometryType: changeGeometryType,
  };
}

// Helper function to draw spectrogram measurement time bounds on waveform
function drawSpectrogramMeasurementBounds(
  ctx: CanvasRenderingContext2D, 
  measurement: LineString, 
  window: SpectrogramWindow
) {
  if (measurement.coordinates.length < 2) return;
  
  const { width, height } = ctx.canvas;
  const timeCoords = measurement.coordinates.map(coord => coord[0]);
  const minTime = Math.min(...timeCoords);
  const maxTime = Math.max(...timeCoords);
  
  // Convert time to canvas x coordinates
  const timeRange = window.time.max - window.time.min;
  const minX = ((minTime - window.time.min) / timeRange) * width;
  const maxX = ((maxTime - window.time.min) / timeRange) * width;
  
  // Draw vertical lines to show time bounds
  ctx.strokeStyle = "rgba(16, 185, 129, 0.8)"; // Green color
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  
  ctx.beginPath();
  ctx.moveTo(minX, 0);
  ctx.lineTo(minX, height);
  ctx.moveTo(maxX, 0);
  ctx.lineTo(maxX, height);
  ctx.stroke();
  
  // Draw a subtle background between the bounds
  ctx.fillStyle = "rgba(16, 185, 129, 0.1)";
  ctx.fillRect(minX, 0, maxX - minX, height);
  
  ctx.setLineDash([]);
}
