import { useCallback, useMemo, useState, useEffect } from "react";

import useAnnotationCreate from "@/hooks/annotation/useAnnotationCreate";
import useAnnotationDelete from "@/hooks/annotation/useAnnotationDelete";
import useAnnotationDraw from "@/hooks/annotation/useAnnotationDraw";
import useAnnotationEdit from "@/hooks/annotation/useAnnotationEdit";
import useAnnotationSelect from "@/hooks/annotation/useAnnotationSelect";
import useClipAnnotation from "@/hooks/api/useClipAnnotation";
import useSpectrogramTags from "@/hooks/spectrogram/useSpectrogramTags";
import useAnnotateClipKeyShortcuts from "@/hooks/annotation/useAnnotateClipKeyShortcuts";
import useCreateWaveformMeasurement from "@/hooks/draw/useCreateWaveformMeasurement";

import { ABORT_SHORTCUT } from "@/utils/keyboard";

import type {
  ClipAnnotation,
  Dimensions,
  Geometry,
  GeometryType,
  LineString,
  SoundEventAnnotation,
  SpectrogramWindow,
  Tag,
} from "@/types";

export type AnnotateMode = "select" | "measure" | "draw" | "edit" | "delete" | "idle";

type DrawFunction = (ctx: CanvasRenderingContext2D) => void;

export type AnnotateClipState = {
  mode: AnnotateMode;
  geometryType: GeometryType;
  selectedAnnotation: SoundEventAnnotation | null;
  annotations: SoundEventAnnotation[];
  isSelecting: boolean;
  isDrawing: boolean;
  isEditing: boolean;
  isDeleting: boolean;
  activeMeasurementCanvas: "spectrogram" | "waveform" | null;
};

export type AnnotateClipActions = {
  setMode: (mode: AnnotateMode) => void;
  focusOnAnnotation: (annotation: SoundEventAnnotation) => void;
  selectAnnotation: (annotation: SoundEventAnnotation) => void;
  clearSelection: () => void;
  enableSelect: () => void;
  enableDraw: () => void;
  enableEdit: () => void;
  enableDelete: () => void;
  setGeometryType: (geometryType: GeometryType) => void;
  disable: () => void;
};

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
    const startA = getStartCoordinate(a.sound_event.geometry);
    const startB = getStartCoordinate(b.sound_event.geometry);
    return startA - startB;
  });
};

export default function useAnnotateClip(props: {
  /** The clip annotation to annotate */
  clipAnnotation: ClipAnnotation;
  /** Current spectrogram viewport */
  viewport: SpectrogramWindow;
  /** Dimensions of the spectrogram canvas */
  dimensions: Dimensions;
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
  onSelectAnnotation?: (annotation: SoundEventAnnotation | null) => void;
  /** Callback when a new annotation is created */
  onCreateAnnotation?: (annotation: SoundEventAnnotation) => void;
  /** Callback when the geometry of an annotation is updated */
  onUpdateAnnotation?: (annotation: SoundEventAnnotation) => void;
  /** Callback when an annotation is deleted */
  onDeleteAnnotation?: (annotation: SoundEventAnnotation) => void;
  /** Callback when a tag is added to a sound event */
  onAddAnnotationTag?: (annotation: SoundEventAnnotation) => void;
  /** Callback when a tag is removed from a sound event */
  onRemoveAnnotationTag?: (annotation: SoundEventAnnotation) => void;
  /** Callback when the annotation mode (idle, create, delete, select, draw)
   * changes */
  onModeChange?: (mode: AnnotateMode) => void;
  /** Callback when an annotation is deselected */
  onDeselect?: () => void;
  onCenterOn: (time: number) => void;
}) {
  const {
    clipAnnotation: data,
    viewport,
    dimensions,
    defaultTags,
    selectedTag,
    mode: initialMode = "select",
    active = true,
    disabled = false,
    withSoundEvent = true,
    onModeChange,
    onSelectAnnotation,
    onCreateAnnotation,
    onAddAnnotationTag,
    onRemoveAnnotationTag,
    onUpdateAnnotation,
    onDeleteAnnotation,
    onDeselect,
    onCenterOn,
  } = props;

  const {
    mode,
    geometryType,
    selectedAnnotation,
    setMode,
    setGeometryType,
    setSelectedAnnotation,
  } = useAnnotateClipState({
    mode: initialMode,
    geometryType: "BoundingBox",
    onSelectAnnotation,
    onChangeMode: onModeChange,
  });

  const {
    data: clipAnnotation,
    addSoundEvent: { mutate: addSoundEvent },
    removeSoundEvent: { mutate: removeSoundEvent },
    updateSoundEvent: { mutate: updateSoundEvent },
    addTagToSoundEvent: { mutate: addTagToSoundEvent },
    removeTagFromSoundEvent: { mutate: removeTagFromSoundEvent },
  } = useClipAnnotation({
    uuid: data.uuid,
    clipAnnotation: data,
    onAddSoundEventAnnotation: onCreateAnnotation,
    onUpdateSoundEventAnnotation: onUpdateAnnotation,
    onDeleteSoundEventAnnotation: onDeleteAnnotation,
    onAddTagToSoundEventAnnotation: onAddAnnotationTag,
    onRemoveTagFromSoundEventAnnotation: onRemoveAnnotationTag,
  });

  const soundEvents = useMemo(
    () => {
      if (withSoundEvent) {
        return clipAnnotation?.sound_events || []
      } else {
        return []
      }
    },
    [clipAnnotation, withSoundEvent],
  );

  const handleCreate = useCallback(
    (geometry: Geometry) => {
      if (disabled) return;
      addSoundEvent(
        {
          geometry,
          tags: defaultTags || [],
        },
        {
          onSuccess: (data) => {
            setSelectedAnnotation(data);
          },
        },
      );
    },
    [defaultTags, addSoundEvent, disabled, setSelectedAnnotation],
  );

  // State to track measurements from different sources
  const [spectrogramMeasurement, setSpectrogramMeasurement] = useState<LineString | null>(null);
  const [measurementSource, setMeasurementSource] = useState<"spectrogram" | "waveform" | null>(null);
  const [activeMeasurementCanvas, setActiveMeasurementCanvas] = useState<"spectrogram" | "waveform" | null>(null);

  // Measurement hook for spectrogram - measurements here will be reflected in waveform
  const { props: spectrogramMeasureProps, draw: drawSpectrogramMeasure } = useAnnotationCreate({
    viewport,
    dimensions,
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
    viewport,
    dimensions,
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
    viewport,
    dimensions,
    geometryType,
    enabled: active && mode === "draw" && !disabled,
    onCreate: handleCreate,
  });

  const { props: selectProps, draw: drawSelect } = useAnnotationSelect({
    viewport,
    dimensions,
    annotations: soundEvents,
    onSelect: setSelectedAnnotation,
    onDeselect,
    enabled: active && mode === "select",
  });

    useEffect(() => {
      const handleKeyPress = (event: KeyboardEvent) => {
        if (event.key === ABORT_SHORTCUT) {
          onSelectAnnotation?.(null);
          onDeselect?.()
          setMode("idle")
          return;
        }
      };
  
      document.addEventListener('keydown', handleKeyPress);
      return () => document.removeEventListener('keydown', handleKeyPress);
    }, [onDeselect, onSelectAnnotation, setMode]);

  const handleDelete = useCallback(
    (annotation: SoundEventAnnotation) => {
      if (disabled) return;
      removeSoundEvent(annotation);
      setMode("idle");
    },
    [removeSoundEvent, setMode, disabled],
  );

  const { props: deleteProps, draw: drawDelete } = useAnnotationDelete({
    viewport,
    dimensions,
    annotations: soundEvents,
    onDelete: handleDelete,
    onDeselect,
    enabled: active && mode === "delete" && !disabled,
  });

  const handleEdit = useCallback(
    (geometry: Geometry) => {
      if (selectedAnnotation == null || disabled) return;
      updateSoundEvent(
        {
          soundEventAnnotation: selectedAnnotation,
          geometry,
        },
        {
          onSuccess: (data) => {
            setSelectedAnnotation(data);
          },
        },
      );
    },
    [selectedAnnotation, updateSoundEvent, setSelectedAnnotation, disabled],
  );

  const handleCopy = useCallback(
    (annotation: SoundEventAnnotation, geometry: Geometry) => {
      if (disabled) return;
      addSoundEvent(
        {
          geometry,
          tags: annotation.tags || [],
        },
        {
          onSuccess: (data) => {
            setSelectedAnnotation(data);
          },
        },
      );
    },
    [addSoundEvent, setSelectedAnnotation, disabled],
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
      (annotation) => annotation.uuid === selectedAnnotation?.uuid  // Use UUID for comparison
    );
  
    const nextIndex = currentIndex === -1 
      ? 0  // If no current selection, start from beginning
      : (currentIndex + 1) % sortedAnnotations.length;
  
    const nextAnnotation = sortedAnnotations[nextIndex];
    setSelectedAnnotation(nextAnnotation);
    onSelectAnnotation?.(nextAnnotation);
  
    // Assume `centerOn` is a function provided by the spectrogram to adjust the viewport.
    if (viewport && nextAnnotation) {
      const annotationStart = getStartCoordinate(nextAnnotation.sound_event.geometry);
      const annotationEnd = getEndCoordinate(nextAnnotation.sound_event.geometry);
  
      // Check if annotation is outside viewport:
      if (annotationStart < viewport.time.min || annotationEnd > viewport.time.max) {
        // Calculate the new center position
        const newCenterTime = (annotationStart + annotationEnd) / 2;
        onCenterOn(newCenterTime);
      }
    }
  }, [filteredSoundEvents, selectedAnnotation, onSelectAnnotation, onCenterOn, viewport, setSelectedAnnotation]);

  const selectPrevAnnotation = useCallback(() => {
    if (!filteredSoundEvents.length) return;
  
    const sortedAnnotations = sortSoundEvents(filteredSoundEvents);
  
    const currentIndex = sortedAnnotations.findIndex(
      (annotation) => annotation.uuid === selectedAnnotation?.uuid  // Use UUID for comparison
    );
  
    const prevIndex = currentIndex === -1 
      ? sortedAnnotations.length - 1  // If no current selection, start from end
      : (currentIndex - 1 + sortedAnnotations.length) % sortedAnnotations.length;
  
    const nextAnnotation = sortedAnnotations[prevIndex];
    setSelectedAnnotation(nextAnnotation);
    onSelectAnnotation?.(nextAnnotation);
  
    // Assume `centerOn` is a function provided by the spectrogram to adjust the viewport.
    if (viewport && nextAnnotation) {
      const annotationStart = getStartCoordinate(nextAnnotation.sound_event.geometry);
      const annotationEnd = getEndCoordinate(nextAnnotation.sound_event.geometry);
  
      // Check if annotation is outside viewport:
      if (annotationStart < viewport.time.min || annotationEnd > viewport.time.max) {
        // Calculate the new center position
        const newCenterTime = (annotationStart + annotationEnd) / 2;
        onCenterOn(newCenterTime);
      }
    }
  }, [filteredSoundEvents, selectedAnnotation, onSelectAnnotation, onCenterOn, viewport, setSelectedAnnotation]);

  const { props: editProps, draw: drawEdit } = useAnnotationEdit({
    viewport,
    dimensions,
    annotation: selectedAnnotation,
    onDeselect,
    onEdit: handleEdit,
    onCopy: handleCopy,
    enabled: active && mode === "edit" && !disabled,
  });

  const handleOnClickTag = useCallback(
    (annotation: SoundEventAnnotation, tag: Tag) => {
      if (disabled) return;
      removeTagFromSoundEvent({
        soundEventAnnotation: annotation,
        tag,
      });
    },
    [removeTagFromSoundEvent, disabled],
  );

  const handleOnAddTag = useCallback(
    (annotation: SoundEventAnnotation, tag: Tag) => {
      if (disabled) return;
      addTagToSoundEvent({
        soundEventAnnotation: annotation,
        tag,
      });
    },
    [addTagToSoundEvent, disabled],
  );

  const tags = useSpectrogramTags({
    annotations: soundEvents,
    viewport: viewport,
    dimensions,
    onClickTag: handleOnClickTag,
    onAddTag: handleOnAddTag,
    active: mode !== "draw" && mode !== "delete",
    disabled,
  });

  const drawAnnotations = useAnnotationDraw({
    viewport,
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
        drawSpectrogramMeasurementBounds(ctx, spectrogramMeasurement, viewport);
      }
      otherDraw(ctx);
    };
  }, [
    mode,
    spectrogramMeasurement,
    measurementSource,
    activeMeasurementCanvas,
    drawWaveformMeasure,
    viewport,
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

  const handleDeleteSelected = useCallback(() => {
    if (selectedAnnotation && !disabled) {
      handleDelete(selectedAnnotation);
    }
  }, [selectedAnnotation, handleDelete, disabled]);

  useAnnotateClipKeyShortcuts({
    onGoMeasure: enableMeasure,
    onGoCreate: enableDraw,
    onGoDelete: enableDelete,
    onGoSelect: enableSelect,
    onGoNext: selectNextAnnotation,
    onGoPrev: selectPrevAnnotation,
    enabled: !disabled,
    selectedAnnotation,
    onDeleteSelectedAnnotation: handleDeleteSelected,
  });

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
    selectedAnnotation,
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

function useAnnotateClipState({
  mode: initialMode = "select",
  geometryType: initialGeometryType = "BoundingBox",
  selectedAnnotation: initialSelectedAnnotation = null,
  onChangeMode,
  onSelectAnnotation,
  onChangeGeometryType,
  disabled = false,
}: {
  mode?: AnnotateMode;
  geometryType?: GeometryType;
  selectedAnnotation?: SoundEventAnnotation | null;
  disabled?: boolean;
  onChangeMode?: (mode: AnnotateMode) => void;
  onSelectAnnotation?: (annotation: SoundEventAnnotation | null) => void;
  onChangeGeometryType?: (geometryType: GeometryType) => void;
}) {
  const [mode, setMode] = useState<AnnotateMode>(initialMode);
  const [geometryType, setGeometryType] = useState<GeometryType>(initialGeometryType);
  const [selectedAnnotation, setSelectedAnnotation] = useState<SoundEventAnnotation | null>(initialSelectedAnnotation);

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
        setSelectedAnnotation(null);
        onSelectAnnotation?.(null);
      }

      if (mode === "idle" && disabled) {
        setSelectedAnnotation(null);
        onSelectAnnotation?.(null);
      }
    },
    [onChangeMode, onSelectAnnotation, setSelectedAnnotation, disabled],
  );

  const changeGeometryType = useCallback(
    (geometryType: GeometryType) => {
      setGeometryType(geometryType);
      onChangeGeometryType?.(geometryType);
    },
    [onChangeGeometryType],
  );

  const selectAnnotation = useCallback(
    (annotation: SoundEventAnnotation) => {
      setSelectedAnnotation(annotation);
      onSelectAnnotation?.(annotation);
      if (disabled) return;
      changeMode("edit");
    },
    [onSelectAnnotation, changeMode, setSelectedAnnotation, disabled],
  );

  return {
    mode,
    geometryType,
    selectedAnnotation,
    setMode: changeMode,
    setSelectedAnnotation: selectAnnotation,
    setGeometryType: changeGeometryType,
  };
}

// Helper function to draw spectrogram measurement time bounds on waveform
function drawSpectrogramMeasurementBounds(
  ctx: CanvasRenderingContext2D, 
  measurement: LineString, 
  viewport: SpectrogramWindow
) {
  if (measurement.coordinates.length < 2) return;
  
  const { width, height } = ctx.canvas;
  const timeCoords = measurement.coordinates.map(coord => coord[0]);
  const minTime = Math.min(...timeCoords);
  const maxTime = Math.max(...timeCoords);
  
  // Convert time to canvas x coordinates
  const timeRange = viewport.time.max - viewport.time.min;
  const minX = ((minTime - viewport.time.min) / timeRange) * width;
  const maxX = ((maxTime - viewport.time.min) / timeRange) * width;
  
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
