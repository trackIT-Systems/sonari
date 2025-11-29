import { useCallback, useMemo, useRef, useState, useEffect } from "react";

import { DEFAULT_SPECTROGRAM_PARAMETERS, applyAutoSTFT } from "@/api/spectrograms";
import AnnotationControls from "@/components/annotation_tasks/AnnotationControls";
import MeasurementControls from "./MeasurementControls";
import Player from "@/components/audio/Player";
import Card from "@/components/Card";
import SpectrogramBar from "@/components/spectrograms/SpectrogramBar";
import SpectrogramControls from "@/components/spectrograms/SpectrogramControls";
import DisableSpectrogramButton from "../spectrograms/DisableSpectrogramButton";
import SpectrogramSettings from "@/components/spectrograms/SpectrogramSettings";
import SpectrogramTags from "@/components/spectrograms/SpectrogramTags";
import TagComponent, { getTagKey } from "@/components/tags/Tag";
import useAnnotateTask from "@/hooks/annotation/useAnnotateTask";
import useAudio from "@/hooks/audio/useAudio";
import useCanvas from "@/hooks/draw/useCanvas";
import useSpectrogram, { clampSamplerate } from "@/hooks/spectrogram/useSpectrogram";
import useSpectrogramTrackAudio from "@/hooks/spectrogram/useSpectrogramTrackAudio";
import { getInitialViewingWindow } from "@/utils/windows";
import type { AnnotateMode } from "@/hooks/annotation/useAnnotateTask";
import type { MotionMode as SpectrogramMode } from "@/hooks/spectrogram/useSpectrogramMotions";
import type {
  Position,
  SoundEventAnnotation,
  SpectrogramParameters,
  SpectrogramWindow,
  Tag,
  Geometry,
  AnnotationTask
} from "@/types";
import useWaveform from "@/hooks/spectrogram/useWaveform";
import useAnnotationDrawWaveform from "@/hooks/annotation/useAnnotationDrawWaveform";
import { NoIcon } from "../icons";
import { SPECTROGRAM_CANVAS_DIMENSIONS, WAVEFORM_CANVAS_DIMENSIONS } from "@/constants";

export default function AnnotationTaskSpectrogram({
  annotationTask,
  parameters = DEFAULT_SPECTROGRAM_PARAMETERS,
  disabled = false,
  withBar = true,
  withPlayer = true,
  withControls = true,
  withSettings = true,
  withAudioShortcuts = true,
  withSpectrogramShortcuts = true,
  withSpectrogram,
  withSoundEvent = true,
  withAutoplay,
  defaultTags,
  selectedTag,
  fixedAspectRatio,
  selectedSoundEventAnnotation,
  onClearSelectedTag,
  toggleFixedAspectRatio,
  onWithSpectrogramChange,
  onWithSoundEventChange,
  onWithAutoplayChange,
  onParameterSave,
  onSelectSoundEventAnnotation,
  onSegmentsLoaded,
  onAddTagToSoundEventAnnotation,
  onRemoveTagFromSoundEventAnnotation,
  onAddSoundEventAnnotation,
  onRemoveSoundEventAnnotation,
  onUpdateSoundEventAnnotation,
}: {
  annotationTask?: AnnotationTask;
  parameters?: SpectrogramParameters;
  disabled?: boolean;
  defaultTags?: Tag[];
  selectedTag: { tag: Tag; count: number } | null;
  height?: number;
  withBar?: boolean;
  withPlayer?: boolean;
  withControls?: boolean;
  withSettings?: boolean;
  withAudioShortcuts?: boolean;
  withSpectrogramShortcuts?: boolean;
  withSpectrogram: boolean;
  withSoundEvent?: boolean;
  withAutoplay: boolean;
  fixedAspectRatio: boolean;
  selectedSoundEventAnnotation?: SoundEventAnnotation | null;
  onClearSelectedTag: (tag: { tag: Tag; count: number } | null) => void;
  toggleFixedAspectRatio: () => void;
  onWithSpectrogramChange: () => void;
  onWithSoundEventChange: () => void;
  onWithAutoplayChange: () => void;
  onParameterSave?: (params: SpectrogramParameters) => void;
  onSelectSoundEventAnnotation?: (soundEventAnnotation: SoundEventAnnotation | null) => void;
  onSegmentsLoaded: () => void;
  onAddTagToSoundEventAnnotation?: (params: { soundEventAnnotation: SoundEventAnnotation; tag: Tag }) => Promise<SoundEventAnnotation>;
  onRemoveTagFromSoundEventAnnotation?: (params: { soundEventAnnotation: SoundEventAnnotation; tag: Tag }) => Promise<SoundEventAnnotation>;
  onAddSoundEventAnnotation?: (params: { geometry: Geometry; tags: Tag[] }) => Promise<SoundEventAnnotation>;
  onRemoveSoundEventAnnotation?: (annotation: SoundEventAnnotation) => void;
  onUpdateSoundEventAnnotation?: (params: { soundEventAnnotation: SoundEventAnnotation; geometry: Geometry }) => void;
}) {
  
  const [isAnnotating, setIsAnnotating] = useState(false);
  const spectrogramCanvasRef = useRef<HTMLCanvasElement>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  
  // Extract recording with null safety
  const { recording, start_time: taskStartTime, end_time: taskEndTime } = annotationTask!;

  // Apply auto STFT calculation to parameters if enabled
  const effectiveParameters = useMemo(() => {
    if (!recording) return parameters;
    return applyAutoSTFT(parameters, recording.samplerate);
  }, [parameters, recording]);
  
  const taskSoundEventAnnotations = useMemo(
    () => annotationTask?.sound_event_annotations ?? [],
    [annotationTask?.sound_event_annotations]
  );

  /**
   * Task bounds - The single source of truth for navigable area.
   * Constrains the spectrogram to the annotation task's time range and
   * the effective frequency range based on current parameters.
   */
  const taskBounds = useMemo<SpectrogramWindow>(() => {
    const baseSamplerate = recording!.samplerate;
    const samplerate = clampSamplerate(effectiveParameters, baseSamplerate)
    
    return {
      time: { min: taskStartTime, max: taskEndTime },
      freq: { min: 0, max: samplerate / 2 },
    };
  }, [taskStartTime, taskEndTime, effectiveParameters, recording]);

  /**
   * Initial window - Determines the starting view when component mounts.
   * If spectrogram is enabled, calculates an optimal initial zoom level based on
   * canvas dimensions. Otherwise, shows the full task range.
   */
  const initial = useMemo(
    () => {
      const baseSamplerate = recording!.samplerate;
      const samplerate = clampSamplerate(effectiveParameters, baseSamplerate)
      if (withSpectrogram) {
        
        const _initial = getInitialViewingWindow({
          startTime: taskStartTime,
          endTime: taskEndTime,
          samplerate: samplerate,
          parameters: effectiveParameters,
        })
        return _initial
      } else {
        return {
          time: { min: taskStartTime, max: taskEndTime },
          freq: { min: 0, max: samplerate / 2 },
        }
      }
    },
    [recording, taskStartTime, taskEndTime, withSpectrogram, effectiveParameters],
  );

  const getPlaybackBounds = useCallback(() => {
    if (!selectedSoundEventAnnotation) {
      return {
        startTime: taskStartTime,
        endTime: taskEndTime
      };
    }


    const { geometry, geometry_type } = selectedSoundEventAnnotation;
    
    var start: number
    var end: number
    var geom: number[]
    switch (geometry_type) {
      case "TimeInterval":
        geom = geometry.coordinates as [number, number];
        start = geom[0]
        end = geom[1]
        return {
          startTime: start,
          endTime: end
        };
      
      case "BoundingBox":
        geom = geometry.coordinates as [number, number, number, number];
        start = geom[0]
        end = geom[2]
        return {
          startTime: start,
          endTime: end
        };
      
      default:
        return {
          startTime: taskStartTime,
          endTime: taskEndTime
        };
    }
  }, [selectedSoundEventAnnotation, taskStartTime, taskEndTime]);

  const { startTime: playbackStartTime, endTime: playbackEndTime } = useMemo(() => getPlaybackBounds(), [getPlaybackBounds]);

  const audio = useAudio({
    recording: recording!,
    endTime: playbackEndTime,
    startTime: playbackStartTime,
    withShortcuts: withAudioShortcuts,
    withAutoplay: withAutoplay,
    onWithAutoplayChange: onWithAutoplayChange,
  });

  const handleSpectrogramModeChange = useCallback(
    (mode: SpectrogramMode) => {
      setIsAnnotating(mode === "idle");
      if (mode !== "idle") {
        onSelectSoundEventAnnotation?.(null);
      }
    },
    [onSelectSoundEventAnnotation],
  );

  const { seek } = audio;
  const handleDoubleClick = useCallback(
    ({ position }: { position: Position }) => {
      seek(position.time);
      audio.setTime(position.time)
    },
    [seek, audio],
  );

  const spectrogram = useSpectrogram({
    task: annotationTask!,
    samplerate: recording!.samplerate,
    bounds: taskBounds,
    initial,
    parameters: effectiveParameters,
    canvasRef: spectrogramCanvasRef,
    onDoubleClick: handleDoubleClick,
    onModeChange: handleSpectrogramModeChange,
    enabled: !isAnnotating && !audio.isPlaying,
    withShortcuts: withSpectrogramShortcuts,
    withSpectrogram: withSpectrogram,
    fixedAspectRatio: fixedAspectRatio,
    toggleFixedAspectRatio: toggleFixedAspectRatio,
    onSegmentsLoaded,
  });

  const handleParameterSave = useCallback(() => {
    onParameterSave?.(spectrogram.parameters);
  }, [onParameterSave, spectrogram.parameters]);

  const waveform = useWaveform({
    recording: recording!,
    parameters: spectrogram.parameters,
    window: spectrogram.window,
  });

  const { centerOn } = spectrogram;

  const handleTimeChange = useCallback(
    (time: number) => centerOn({ time }),
    [centerOn],
  );

  const {
    draw: drawTrackAudio,
    enabled: trackingAudio,
    drawOnsetAt
  } = useSpectrogramTrackAudio({
    window: spectrogram.window,
    currentTime: audio.currentTime,
    isPlaying: audio.isPlaying,
    onTimeChange: handleTimeChange,
  });

  const handleAnnotationModeChange = useCallback(
    (mode: AnnotateMode) => setIsAnnotating(mode !== "idle"),
    [],
  );

  const handleAnnotationDeselect = useCallback(() => {
    setIsAnnotating(false);
    onSelectSoundEventAnnotation?.(null);
  }, [onSelectSoundEventAnnotation]);

  const annotate = useAnnotateTask({
    annotationTask,
    window: spectrogram.window,
    canvasRef: spectrogramCanvasRef,
    onCenterOn: handleTimeChange,
    defaultTags,
    selectedTag,
    onModeChange: handleAnnotationModeChange,
    onDeselect: handleAnnotationDeselect,
    active: isAnnotating && !audio.isPlaying,
    onSelectSoundEventAnnotation,
    disabled,
    withSoundEvent,
    onAddSoundEventAnnotation,
    onRemoveSoundEventAnnotation,
    onUpdateSoundEventAnnotation,
    onAddTagToSoundEventAnnotation,
    onRemoveTagFromSoundEventAnnotation,
  });

  const {
    props: spectrogramProps,
    draw: drawSpectrogram,
    isLoading: spectrogramIsLoading,
  } = spectrogram;

  const soundEventAnnotations = useMemo(() => {
    if (withSoundEvent) {
      return taskSoundEventAnnotations
    } else {
      return []
    }
  }, [taskSoundEventAnnotations, withSoundEvent]);

  // Waveform annotation drawing for non-measurement annotations
  const drawWaveformAnnotationsLegacy = useAnnotationDrawWaveform({
    window: spectrogram.window,
    soundEventAnnotations: soundEventAnnotations,
    selectedSoundEventAnnotation: selectedSoundEventAnnotation,
  });

  const drawSpectrogramCanvas = useMemo(() => {
    // Wait until all visible chunks are loaded before displaying
    if (spectrogramIsLoading) {
      return (ctx: CanvasRenderingContext2D) => {
        ctx.canvas.style.cursor = "wait";
      };
    }
    if (trackingAudio) {
      return (ctx: CanvasRenderingContext2D) => {
        ctx.canvas.style.cursor = "default";
        drawSpectrogram(ctx);
        drawTrackAudio(ctx);
        annotate?.drawSpectrogram(ctx);
      };
    }
    return (ctx: CanvasRenderingContext2D) => {
      ctx.canvas.style.cursor = "default";
      drawSpectrogram(ctx);
      // Draw the onset line even when not playing
      drawOnsetAt?.(ctx, audio.currentTime);
      annotate?.drawSpectrogram(ctx);
    };
  }, [
    drawSpectrogram,
    drawTrackAudio,
    drawOnsetAt,
    annotate,
    spectrogramIsLoading,
    trackingAudio,
    audio.currentTime,
  ]);

  const drawWaveformCanvas = useCallback((ctx: CanvasRenderingContext2D) => {
    // Wait until all visible chunks are loaded before displaying
    if (waveform.isLoading) {
      ctx.canvas.style.cursor = "wait";
      return;
    }
    ctx.canvas.style.cursor = "default";
    
    // Draw complete waveform
    waveform.draw(ctx);
    
    // Draw the audio tracking onset over the waveform
    if (trackingAudio) {
      drawTrackAudio(ctx);
    } else {
      // Draw static onset when not playing
      drawOnsetAt?.(ctx, audio.currentTime);
    }
    
    // Always draw sound event annotations when enabled
    if (withSoundEvent && soundEventAnnotations.length > 0) {
      drawWaveformAnnotationsLegacy(ctx);
    }
    
    // Draw measurement-aware annotations (includes measurement reflection from spectrogram)
    annotate?.drawWaveform(ctx);
  }, [waveform, trackingAudio, drawTrackAudio, drawOnsetAt, audio.currentTime, withSoundEvent, soundEventAnnotations, drawWaveformAnnotationsLegacy]);

  useCanvas({ ref: spectrogramCanvasRef as React.RefObject<HTMLCanvasElement>, draw: drawSpectrogramCanvas });
  useCanvas({ ref: waveformCanvasRef as React.RefObject<HTMLCanvasElement>, draw: drawWaveformCanvas });

  const handleClearSelectedTag = useCallback(() => {
    onClearSelectedTag(null);
  }, [onClearSelectedTag]);

  // Determine which props to use for each canvas based on annotation mode
  const finalSpectrogramProps = isAnnotating ? annotate?.spectrogramProps : spectrogramProps;
  const finalWaveformProps = isAnnotating ? annotate?.waveformProps : {};

  // Return early if no annotation task or recording (after all hooks have been called)
  if (!annotationTask || !recording) {
    return (
      <div className="flex items-center justify-center p-4">
        <NoIcon className="inline-block ms-2 stroke-inherit" />
      </div>
    );
  }

  return (
    <Card>
      <div className="flex flex-row gap-4">
        <DisableSpectrogramButton
          withSpectrogram={withSpectrogram}
          onWithSpectrogramChange={onWithSpectrogramChange}
        />
        {withControls && (
          <SpectrogramControls
            canZoom={spectrogram.canZoom}
            fixedAspectRatio={fixedAspectRatio}
            onReset={spectrogram.reset}
            onZoom={spectrogram.enableZoom}
            onToggleAspectRatio={toggleFixedAspectRatio}
          />
        )}

        {!disabled && withControls && withSpectrogram && annotate && (
          <MeasurementControls
            isMeasuring={annotate.isMeasuring}
            onMeasure={annotate.enableMeasure}
          />
        )}
        {!disabled && withControls && withSpectrogram && withSoundEvent && annotate && (
          <AnnotationControls
            disabled={disabled}
            isDrawing={annotate.isDrawing}
            isDeleting={annotate.isDeleting}
            isSelecting={annotate.isSelecting}
            isEditing={annotate.isEditing}
            geometryType={annotate.geometryType}
            onDraw={annotate.enableDraw}
            onDelete={annotate.enableDelete}
            onSelect={annotate.enableSelect}
            onSelectGeometryType={annotate.setGeometryType}
          />
        )}
        {withSettings && withSpectrogram && withSoundEvent && (
          <SpectrogramSettings
            samplerate={recording.samplerate}
            maxChannels={recording.channels}
            settings={spectrogram.parameters}
            onChange={spectrogram.setParameters}
            onReset={spectrogram.resetParameters}
            onSave={handleParameterSave}
          />
        )}
        {withPlayer && <Player {...audio} />}
      </div>
      <div className="relative overflow-visible rounded-md" style={{ height: SPECTROGRAM_CANVAS_DIMENSIONS.height, width: SPECTROGRAM_CANVAS_DIMENSIONS.width }}>
        <SpectrogramTags
          disabled={disabled}
          tags={annotate?.tags ?? []}
          withSoundEvent={withSoundEvent}
          onWithSoundEventChange={onWithSoundEventChange}
        >
          <canvas
            ref={spectrogramCanvasRef}
            {...finalSpectrogramProps}
            className="absolute w-full h-full"
            id="main-spectrogram-canvas"
            width={SPECTROGRAM_CANVAS_DIMENSIONS.width}
            height={SPECTROGRAM_CANVAS_DIMENSIONS.height}
          />
        </SpectrogramTags>
        {selectedTag && (
          <div className="absolute top-2 right-2 z-10">
            <TagComponent
              key={getTagKey(selectedTag.tag)}
              tag={selectedTag.tag}
              onClose={handleClearSelectedTag}
              onClick={handleClearSelectedTag}
              count={selectedTag.count}
            />
          </div>
        )}
      </div>
      <div className="relative overflow-hidden rounded-md" style={{ height: WAVEFORM_CANVAS_DIMENSIONS.height, width: WAVEFORM_CANVAS_DIMENSIONS.width }}>
          <canvas
          ref={waveformCanvasRef}
            {...finalWaveformProps}
            className="absolute w-full h-full"
            id="main-waveform-canvas"
            width={WAVEFORM_CANVAS_DIMENSIONS.width}
            height={WAVEFORM_CANVAS_DIMENSIONS.height}
          />
      </div>
      {withBar && (
        <SpectrogramBar
          recordingId={recording.id}
          bounds={taskBounds}
          window={withSpectrogram ? spectrogram.window : taskBounds}
          onMove={spectrogram.drag}
          samplerate={recording.samplerate}
          parameters={spectrogram.parameters}
          withSpectrogram={withSpectrogram}
        />
      )}
    </Card>
  );
}
