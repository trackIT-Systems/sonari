import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useKeyPressEvent } from "react-use";
import useCanvas from "@/hooks/draw/useCanvas";
import useSpectrogram from "@/hooks/spectrogram/useSpectrogram";
import useCreateLineString from "@/hooks/draw/useCreateLineString";
import useKeyFilter from "@/hooks/utils/useKeyFilter";
import { applyAutoSTFT } from "@/api/spectrograms";
import type {
  AnnotationTask,
  SoundEventAnnotation,
  SpectrogramParameters,
  SpectrogramWindow,
} from "@/types";
import { H4 } from "../Headings";
import { ExplorationIcon } from "../icons";
import {
  adjustWindowToBounds,
  getInitialViewingWindow,
  matchWindowScaleRatio,
} from "@/utils/windows";
import { PSD_TOGGLE_SHORTCUT } from "@/utils/keyboard";
import { SOUND_EVENT_CANVAS_DIMENSIONS, ZOOM_FACTOR } from "@/constants";
import SoundEventAnnotationPSD from "./SoundEventAnnotationPSD";
import SpectrogramControls from "../spectrograms/SpectrogramControls";
import SpectrogramZoomControls from "../spectrograms/SpectrogramZoomControls";
import MeasurementControls from "../annotation_tasks/MeasurementControls";
import useStore from "@/store";
import Button from "../Button";

const MEASURE_STYLE = {
  borderColor: "rgb(16 185 129)",
  fillColor: "rgb(16 185 129)",
  borderWidth: 2,
  borderDash: [5, 5],
  fillAlpha: 0.2,
};

function getWindowFromGeometry(annotation: SoundEventAnnotation, taskStartTime: number, taskEndTime: number, samplerate: number) {
    const { geometry, geometry_type } = annotation;
    const duration = taskEndTime - taskStartTime;

    switch (geometry_type) {
        case "TimeInterval":
            const ti_coordinates = geometry.coordinates as [number, number];
            // Coordinates are in absolute recording time, convert to relative
            const ti_start_rel = ti_coordinates[0] - taskStartTime;
            const ti_end_rel = ti_coordinates[1] - taskStartTime;
            var ti_duration_margin = (ti_end_rel - ti_start_rel) * 0.1;
            return {
                time: {
                    min: Math.max(0, ti_start_rel - ti_duration_margin),
                    max: Math.min(ti_end_rel + ti_duration_margin, duration),
                },
                freq: {
                    min: 0,
                    max: samplerate / 2,
                },
            };

        case "BoundingBox":
            const bb_coordinates = geometry.coordinates as [number, number, number, number];
            // Coordinates are in absolute recording time, convert to relative
            const bb_start_rel = bb_coordinates[0] - taskStartTime;
            const bb_end_rel = bb_coordinates[2] - taskStartTime;
            var bandwidth_margin = (bb_coordinates[3] - bb_coordinates[1]) * 0.1;
            var bb_duration_margin = (bb_end_rel - bb_start_rel) * 0.1;
            return {
                time: {
                    min: Math.max(0, bb_start_rel - bb_duration_margin),
                    max: Math.min(bb_end_rel + bb_duration_margin, duration),
                },
                freq: {
                    min: Math.max(0, bb_coordinates[1] - bandwidth_margin),
                    max: Math.min(bb_coordinates[3] + bandwidth_margin, samplerate / 2),
                },
            };
        default:
            return {
                time: {
                    min: 0,
                    max: duration,
                },
                freq: {
                    min: 0,
                    max: samplerate / 2,
                },
            }
    }
}

function getSoundEventCoordinates(annotation: SoundEventAnnotation, taskStartTime: number) {
    const { geometry, geometry_type } = annotation;
    // Coordinates are in absolute recording time, convert to relative for display
    switch (geometry_type) {
        case "TimeInterval":
            const ti_coordinates = geometry.coordinates as [number, number];
            return {
                time: {
                    min: ti_coordinates[0] - taskStartTime,
                    max: ti_coordinates[1] - taskStartTime,
                },
                freq: {
                    min: 0,
                    max: 0, // TimeInterval doesn't have frequency bounds
                },
            };

        case "BoundingBox":
            const bb_coordinates = geometry.coordinates as [number, number, number, number];
            return {
                time: {
                    min: bb_coordinates[0] - taskStartTime,
                    max: bb_coordinates[2] - taskStartTime,
                },
                freq: {
                    min: bb_coordinates[1],
                    max: bb_coordinates[3],
                },
            };

        case "TimeStamp":
            const time = geometry.coordinates as number;
            return {
                time: {
                    min: time - taskStartTime,
                    max: time - taskStartTime,
                },
                freq: {
                    min: 0,
                    max: 0,
                },
            };

        case "Point":
            const point_coordinates = geometry.coordinates as [number, number];
            return {
                time: {
                    min: point_coordinates[0] - taskStartTime,
                    max: point_coordinates[0] - taskStartTime,
                },
                freq: {
                    min: point_coordinates[1],
                    max: point_coordinates[1],
                },
            };

        default:
            return {
                time: {
                    min: 0,
                    max: 0,
                },
                freq: {
                    min: 0,
                    max: 0,
                },
            };
    }
}

export default function SoundEventAnnotationSpectrogramView({
    soundEventAnnotation,
    task,
    samplerate,
    parameters,
    withSpectrogram,
    getReferenceWindow,
}: {
    soundEventAnnotation: SoundEventAnnotation;
    task: AnnotationTask,
    samplerate: number,
    parameters: SpectrogramParameters;
    withSpectrogram: boolean;
    /** Current window of the main spectrogram, whose scale ratio this view copies */
    getReferenceWindow?: () => SpectrogramWindow | null;
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const showPSD = useStore((s) => s.showPSD);
    const setShowPSD = useStore((s) => s.setShowPSD);

    const [isMeasuring, setIsMeasuring] = useState(false);
    const [fixedAspectRatio, setFixedAspectRatio] = useState(false);

    // Keyboard shortcut to toggle PSD view
    useKeyPressEvent(useKeyFilter({ key: PSD_TOGGLE_SHORTCUT }), () => setShowPSD(!showPSD));

    // Calculate effective samplerate accounting for resampling
    const effectiveSamplerate = useMemo(() => {
        return parameters.resample && parameters.samplerate
            ? parameters.samplerate
            : samplerate;
    }, [parameters.resample, parameters.samplerate, samplerate]);

    const selectedParameters = useMemo(() => {
        // Apply auto STFT calculation if enabled
        return applyAutoSTFT(parameters, samplerate);
    }, [parameters, samplerate]);

    /** The whole task stays navigable, so the user can pan out of the sound event. */
    const bounds = useMemo<SpectrogramWindow>(() => ({
        time: { min: task.start_time, max: task.end_time },
        freq: { min: 0, max: effectiveSamplerate / 2 },
    }), [task.start_time, task.end_time, effectiveSamplerate]);

    // getWindowFromGeometry converts absolute annotation coords to relative [0, duration],
    // then we convert back to absolute for useSpectrogram.
    const initial = useMemo(() => {
        const relWindow = getWindowFromGeometry(
            soundEventAnnotation,
            task.start_time,
            task.end_time,
            effectiveSamplerate
        );
        const fitted = {
            time: {
                min: relWindow.time.min + task.start_time,
                max: relWindow.time.max + task.start_time,
            },
            freq: relWindow.freq,
        };

        // Show the sound event at the scale the main spectrogram is currently
        // using, so it keeps the shape the user just looked at. Before the main
        // spectrogram reports a window, fall back to the view it opens with.
        const reference =
            getReferenceWindow?.() ??
            getInitialViewingWindow({
                startTime: task.start_time,
                endTime: task.end_time,
                samplerate: effectiveSamplerate,
                parameters: selectedParameters,
            });

        return adjustWindowToBounds(
            matchWindowScaleRatio({
                window: fitted,
                dimensions: SOUND_EVENT_CANVAS_DIMENSIONS,
                reference,
            }),
            bounds,
        );
    }, [
        soundEventAnnotation,
        effectiveSamplerate,
        task.start_time,
        task.end_time,
        selectedParameters,
        bounds,
        getReferenceWindow,
    ]);

    const soundEventCoords = useMemo(
        () => getSoundEventCoordinates(soundEventAnnotation, task.start_time),
        [soundEventAnnotation, task.start_time]
    );

    const toggleFixedAspectRatio = useCallback(() => {
        setFixedAspectRatio((prev) => !prev);
    }, []);

    const spectrogram = useSpectrogram({
        task,
        samplerate: effectiveSamplerate,
        bounds,
        initial,
        parameters: selectedParameters,
        canvasRef,
        dimensions: SOUND_EVENT_CANVAS_DIMENSIONS,
        enabled: !isMeasuring,
        withSpectrogram,
        withShortcuts: false,
        fixedAspectRatio,
        preload: false,
        toggleFixedAspectRatio,
        onSegmentsLoaded: () => null,
    });

    const { draw, window: spectrogramWindow, props: spectrogramProps, zoom, scale } = spectrogram;

    // This view exists to show one sound event, so reset goes back to it
    // instead of keeping the current position like the main spectrogram does.
    const handleReset = useCallback(() => zoom(initial), [zoom, initial]);

    // Scale both axes by the same factor: that keeps the view centred on what
    // the user is looking at and preserves the main spectrogram's scale ratio.
    const handleZoomIn = useCallback(
        () => scale({ time: 1 - ZOOM_FACTOR, freq: 1 - ZOOM_FACTOR }),
        [scale],
    );
    const handleZoomOut = useCallback(
        () => scale({ time: 1 + ZOOM_FACTOR, freq: 1 + ZOOM_FACTOR }),
        [scale],
    );

    // The measurement stays on screen until it is cleared with a shift click or
    // by leaving measure mode, same as on the main spectrogram.
    const { props: measureProps, draw: drawMeasurement } = useCreateLineString({
        window: spectrogramWindow,
        dimensions: SOUND_EVENT_CANVAS_DIMENSIONS,
        enabled: isMeasuring,
        style: MEASURE_STYLE,
    });

    const handleToggleMeasure = useCallback(() => {
        setIsMeasuring((prev) => !prev);
    }, []);

    // Leaving the spectrogram (e.g. for the PSD view) ends the measurement.
    useEffect(() => {
        if (showPSD || !withSpectrogram) setIsMeasuring(false);
    }, [showPSD, withSpectrogram]);

    const canvasProps = isMeasuring ? measureProps : spectrogramProps;

    const drawCanvas = useCallback(
        (ctx: CanvasRenderingContext2D) => {
            // Frequency lines belong to the main spectrogram; they would only
            // clutter this zoomed in view.
            draw(ctx, { withAxes: false, withFreqLines: false });
            drawMeasurement(ctx);
        },
        [draw, drawMeasurement],
    );

    useCanvas({
        ref: canvasRef as React.RefObject<HTMLCanvasElement>,
        draw: drawCanvas,
    });

    return (
        <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center gap-2 mb-2">
                <H4 className="text-center whitespace-nowrap">
                    <ExplorationIcon className="inline-block mr-1 w-5 h-5" />
                    {showPSD ? "Power Spectral Density" : "Sound Event Spectrogram"}
                </H4>
                <Button
                    variant={showPSD ? "primary" : "secondary"}
                    padding="px-2 py-1"
                    onClick={() => setShowPSD(!showPSD)}
                    className="min-w-[8rem] text-xs justify-center items-center leading-tight"
                >
                    {showPSD ? "PSD" : "Spectrogram"}
                </Button>
            </div>
            {/* PSD view - hidden when showing spectrogram */}
            <div style={{ display: showPSD ? "block" : "none" }}>
                <SoundEventAnnotationPSD
                    soundEventAnnotation={soundEventAnnotation}
                    task={task}
                    samplerate={effectiveSamplerate}
                    parameters={selectedParameters}
                    width={448}
                    height={224}
                />
            </div>

            {/* Spectrogram view - hidden when showing PSD */}
            <div style={{ display: showPSD ? "none" : "block" }}>
                {withSpectrogram && (
                    <div className="flex flex-row gap-4 mb-2">
                        <SpectrogramControls
                            canZoom={spectrogram.canZoom}
                            fixedAspectRatio={fixedAspectRatio}
                            withShortcutHints={false}
                            onReset={handleReset}
                            onZoom={spectrogram.enableZoom}
                            onToggleAspectRatio={toggleFixedAspectRatio}
                        />
                        <SpectrogramZoomControls
                            withShortcutHints={false}
                            onZoomIn={handleZoomIn}
                            onZoomOut={handleZoomOut}
                        />
                        <MeasurementControls
                            isMeasuring={isMeasuring}
                            withShortcutHints={false}
                            onMeasure={handleToggleMeasure}
                        />
                    </div>
                )}
                <div className="flex">
                    <div className="flex flex-col justify-between pr-2 text-right w-16">
                        <span className="text-xs text-stone-600">
                            {spectrogramWindow.freq.max > 0 ? (spectrogramWindow.freq.max / 1000).toFixed(2) + " kHz" : ""}
                        </span>
                        <span className="text-xs text-stone-600 text-center">
                            {spectrogramWindow.freq.max > spectrogramWindow.freq.min ?
                                "∆: " + ((spectrogramWindow.freq.max - spectrogramWindow.freq.min) / 1000).toFixed(2) + " kHz" : ""}
                        </span>
                        <span className="text-xs text-stone-600">
                            {spectrogramWindow.freq.min > 0 ? (spectrogramWindow.freq.min / 1000).toFixed(2) + " kHz" : ""}
                        </span>
                    </div>

                    <div
                        className="relative flex items-center justify-center overflow-clip rounded-md border border-stone-200 dark:border-stone-600"
                        style={{
                            width: SOUND_EVENT_CANVAS_DIMENSIONS.width,
                            height: SOUND_EVENT_CANVAS_DIMENSIONS.height,
                        }}
                    >
                        <canvas
                            ref={canvasRef}
                            width={SOUND_EVENT_CANVAS_DIMENSIONS.width}
                            height={SOUND_EVENT_CANVAS_DIMENSIONS.height}
                            style={{
                                width: SOUND_EVENT_CANVAS_DIMENSIONS.width,
                                height: SOUND_EVENT_CANVAS_DIMENSIONS.height,
                            }}
                            className="rounded-md"
                            {...canvasProps}
                        />
                        {spectrogram.isLoading && (
                            <div className="absolute inset-0 flex items-center justify-center bg-stone-100 dark:bg-stone-800 bg-opacity-50">
                                <span className="text-sm text-stone-500">Loading...</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex justify-between pl-16 pr-2 pt-2">
                    <span className="text-xs text-stone-600">{(soundEventCoords.time.min * 1000).toFixed(0)}ms</span>
                    <span className="text-xs text-stone-600 text-center">
                        {soundEventCoords.time.max > soundEventCoords.time.min ?
                            "∆: " + ((soundEventCoords.time.max - soundEventCoords.time.min) * 1000).toFixed(0) + "ms" : ""}
                    </span>
                    <span className="text-xs text-stone-600">{(soundEventCoords.time.max * 1000).toFixed(0)}ms</span>
                </div>
            </div>
        </div>
    );
}
