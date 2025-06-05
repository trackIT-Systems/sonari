import { useCallback, useMemo, useRef, useState, useEffect } from "react";

import { DEFAULT_SPECTROGRAM_PARAMETERS } from "@/api/spectrograms";
import AnnotationControls from "@/components/annotation/AnnotationControls";
import Player from "@/components/audio/Player";
import Card from "@/components/Card";
import SpectrogramBar from "@/components/spectrograms/SpectrogramBar";
import SpectrogramControls from "@/components/spectrograms/SpectrogramControls";
import DisableSpectrogramButton from "../spectrograms/DisableSpectrogramButton";
import SpectrogramSettings from "@/components/spectrograms/SpectrogramSettings";
import SpectrogramTags from "@/components/spectrograms/SpectrogramTags";
import TagComponent, { getTagKey } from "@/components/tags/Tag";
import useAnnotateClip from "@/hooks/annotation/useAnnotateClip";
import useAudio from "@/hooks/audio/useAudio";
import useCanvas from "@/hooks/draw/useCanvas";
import useSpectrogram from "@/hooks/spectrogram/useSpectrogram";
import useSpectrogramTrackAudio from "@/hooks/spectrogram/useSpectrogramTrackAudio";
import { getInitialViewingWindow } from "@/utils/windows";

import type { TagFilter } from "@/api/tags";
import type { AnnotateMode } from "@/hooks/annotation/useAnnotateClip";
import type { MotionMode as SpectrogramMode } from "@/hooks/spectrogram/useSpectrogramMotions";
import type {
  ClipAnnotation,
  Position,
  SoundEventAnnotation,
  SpectrogramParameters,
  Tag,
} from "@/types";

export default function ClipAnnotationSpectrogram({
  clipAnnotation,
  tagFilter,
  parameters = DEFAULT_SPECTROGRAM_PARAMETERS,
  disabled = false,
  height = 384,
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
  selectedAnnotation,
  onClearSelectedTag,
  toggleFixedAspectRatio,
  onWithSpectrogramChange,
  onWithSoundEventChange,
  onWithAutoplayChange,
  onAddSoundEventTag,
  onRemoveSoundEventTag,
  onCreateSoundEventAnnotation,
  onUpdateSoundEventAnnotation,
  onDeleteSoundEventAnnotation,
  onParameterSave,
  onSelectAnnotation,
  onCreateTag,
  onSegmentsLoaded,
}: {
  clipAnnotation: ClipAnnotation;
  parameters?: SpectrogramParameters;
  tagFilter?: TagFilter;
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
  selectedAnnotation?: SoundEventAnnotation | null;
  onClearSelectedTag: (tag: { tag: Tag; count: number } | null) => void;
  toggleFixedAspectRatio: () => void;
  onWithSpectrogramChange: () => void;
  onWithSoundEventChange: () => void;
  onWithAutoplayChange: () => void;
  onParameterSave?: (params: SpectrogramParameters) => void;
  onSelectAnnotation?: (annotation: SoundEventAnnotation | null) => void;
  onCreateSoundEventAnnotation?: (annotation: SoundEventAnnotation) => void;
  onUpdateSoundEventAnnotation?: (annotation: SoundEventAnnotation) => void;
  onDeleteSoundEventAnnotation?: (annotation: SoundEventAnnotation) => void;
  onAddSoundEventTag?: (annotation: SoundEventAnnotation) => void;
  onRemoveSoundEventTag?: (annotation: SoundEventAnnotation) => void;
  onCreateTag?: (tag: Tag) => void;
  onSegmentsLoaded: () => void;
}) {
  const [isAnnotating, setIsAnnotating] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dimensions = canvasRef.current?.getBoundingClientRect() ?? {
    width: 0,
    height: 0,
  };

  const { clip } = clipAnnotation;
  const { recording } = clip;

  const initialParameters = useMemo(() => {
    const shouldBeHSR = recording.samplerate > 96000;
    const currentPreset = parameters.conf_preset;
    

    var params = parameters;
    if (shouldBeHSR && currentPreset !== 'hsr') {
      params = {
        ...parameters,
        conf_preset: 'hsr',
        window_size: 0.00319,
      };
    } else if (!shouldBeHSR && currentPreset !== 'lsr') {
      params = {
        ...parameters,
        conf_preset: 'lsr',
        window_size: 0.03,
      };
    }
    
    return params;
  }, [recording.samplerate, parameters]);

  useEffect(() => {
    if (initialParameters !== parameters) {
      onParameterSave?.(initialParameters);
    }
  }, [initialParameters, parameters, onParameterSave]);

  const bounds = useMemo(
    () => ({
      time: { min: clip.start_time, max: clip.end_time },
      freq: { min: 0, max: recording.samplerate / 2 },
    }),
    [clip.start_time, clip.end_time, recording.samplerate],
  );

  const initial = useMemo(
    () => {
      if (withSpectrogram) {
        return getInitialViewingWindow({
          startTime: clip.start_time,
          endTime: clip.end_time,
          samplerate: recording.samplerate,
          parameters,
        })
      } else {
        return {
          time: { min: clip.start_time, max: clip.end_time },
          freq: { min: 0, max: recording.samplerate / 2 },
        }
      }
    },
    [recording.samplerate, clip.start_time, clip.end_time, parameters, withSpectrogram],
  );

  const getPlaybackBounds = useCallback(() => {
    if (!selectedAnnotation) {
      return {
        startTime: clip.start_time,
        endTime: clip.end_time
      };
    }


    const { geometry, geometry_type } = selectedAnnotation.sound_event;
    
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
          startTime: clip.start_time,
          endTime: clip.end_time
        };
    }
  }, [selectedAnnotation, clip.start_time, clip.end_time]);

  const { startTime, endTime } = useMemo(() => getPlaybackBounds(), [getPlaybackBounds]);

  const audio = useAudio({
    recording,
    endTime: endTime,
    startTime: startTime,
    withShortcuts: withAudioShortcuts,
    withAutoplay: withAutoplay,
    onWithAutoplayChange: onWithAutoplayChange,
  });

  const handleSpectrogramModeChange = useCallback(
    (mode: SpectrogramMode) => {
      setIsAnnotating(mode === "idle");
      if (mode !== "idle") {
        onSelectAnnotation?.(null);
      }
    },
    [onSelectAnnotation],
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
    dimensions,
    recording,
    bounds,
    initial,
    parameters: initialParameters,
    onDoubleClick: handleDoubleClick,
    onModeChange: handleSpectrogramModeChange,
    enabled: !isAnnotating && !audio.isPlaying,
    withShortcuts: withSpectrogramShortcuts,
    withSpectrogram: withSpectrogram,
    fixedAspectRatio: fixedAspectRatio,
    toggleFixedAspectRatio: toggleFixedAspectRatio,
    onSegmentsLoaded,
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
    viewport: spectrogram.viewport,
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
    onSelectAnnotation?.(null);
  }, [onSelectAnnotation]);

  const annotate = useAnnotateClip({
    clipAnnotation,
    viewport: spectrogram.viewport,
    onCenterOn: handleTimeChange,
    dimensions,
    defaultTags,
    selectedTag,
    onModeChange: handleAnnotationModeChange,
    onDeselect: handleAnnotationDeselect,
    active: isAnnotating && !audio.isPlaying,
    onSelectAnnotation,
    disabled,
    withSoundEvent,
    onAddAnnotationTag: onAddSoundEventTag,
    onRemoveAnnotationTag: onRemoveSoundEventTag,
    onCreateAnnotation: onCreateSoundEventAnnotation,
    onUpdateAnnotation: onUpdateSoundEventAnnotation,
    onDeleteAnnotation: onDeleteSoundEventAnnotation,
  });

  const {
    props: spectrogramProps,
    draw: drawSpectrogram,
    isLoading: spectrogramIsLoading,
  } = spectrogram;
  const { props: annotateProps, draw: drawAnnotations } = annotate;

  const draw = useMemo(() => {
    if (spectrogramIsLoading) {
      return (ctx: CanvasRenderingContext2D) => {
        ctx.canvas.style.cursor = "wait";
      };
    }
    if (trackingAudio) {
      return (ctx: CanvasRenderingContext2D) => {
        drawSpectrogram(ctx);
        drawTrackAudio(ctx);
        drawAnnotations(ctx);
      };
    }
    return (ctx: CanvasRenderingContext2D) => {
      drawSpectrogram(ctx);
      // Draw the onset line even when not playing
      drawOnsetAt?.(ctx, audio.currentTime);
      drawAnnotations(ctx);
    };
  }, [
    drawSpectrogram,
    drawTrackAudio,
    drawOnsetAt,
    drawAnnotations,
    spectrogramIsLoading,
    trackingAudio,
    audio.currentTime,
  ]);

  useCanvas({ ref: canvasRef as React.RefObject<HTMLCanvasElement>, draw });

  const handleClearSelectedTag = useCallback(() => {
    onClearSelectedTag(null);
  }, [onClearSelectedTag]);

  const props = isAnnotating ? annotateProps : spectrogramProps;
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
        {!disabled && withControls && withSpectrogram && withSoundEvent && (
          <AnnotationControls
            disabled={disabled}
            isMeasuring={annotate.isMeasuring}
            isDrawing={annotate.isDrawing}
            isDeleting={annotate.isDeleting}
            isSelecting={annotate.isSelecting}
            isEditing={annotate.isEditing}
            geometryType={annotate.geometryType}
            onMeasure={annotate.enableMeasure}
            onDraw={annotate.enableDraw}
            onDelete={annotate.enableDelete}
            onSelect={annotate.enableSelect}
            onSelectGeometryType={annotate.setGeometryType}
          />
        )}
        {withSettings && withSpectrogram && withSoundEvent && (
          <SpectrogramSettings
            samplerate={recording.samplerate}
            settings={spectrogram.parameters}
            onChange={spectrogram.setParameters}
            onReset={spectrogram.resetParameters}
            onSave={() => onParameterSave?.(spectrogram.parameters)}
          />
        )}
        {withPlayer && <Player {...audio} />}
      </div>
      <div className="relative overflow-hidden rounded-md" style={{ height }}>
        <SpectrogramTags
          disabled={disabled}
          tags={annotate.tags}
          filter={tagFilter}
          onCreate={onCreateTag}
          withSoundEvent={withSoundEvent}
          onWithSoundEventChange={onWithSoundEventChange}
        >
          <canvas
            ref={canvasRef}
            {...props}
            className="absolute w-full h-full"
            id="main-spectrogram-canvas" // Add an ID to easily reference this canvas
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
      {withBar && (
        <SpectrogramBar
          bounds={spectrogram.bounds}
          viewport={withSpectrogram ? spectrogram.viewport : spectrogram.bounds}
          onMove={spectrogram.drag}
          recording={recording}
          parameters={spectrogram.parameters}
          withSpectrogram={withSpectrogram}
        />
      )}
    </Card>
  );
}
