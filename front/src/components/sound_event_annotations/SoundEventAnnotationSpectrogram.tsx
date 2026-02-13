import { useRef, useMemo } from "react";
import { useKeyPressEvent } from "react-use";
import useCanvas from "@/hooks/draw/useCanvas";
import useSpectrogram from "@/hooks/spectrogram/useSpectrogram";
import useKeyFilter from "@/hooks/utils/useKeyFilter";
import { applyAutoSTFT } from "@/api/spectrograms";
import type { AnnotationTask, SoundEventAnnotation, SpectrogramParameters } from "@/types";
import { H4 } from "../Headings";
import { ExplorationIcon } from "../icons";
import {
  calculateTimeFrames,
  frequencyRangeToBinRange,
} from "@/utils/spectrogram_calculations";
import { PSD_TOGGLE_SHORTCUT } from "@/utils/keyboard";
import SoundEventAnnotationPSD from "./SoundEventAnnotationPSD";
import useStore from "@/store";
import Button from "../Button";

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

function calculateSpectrogramDimensions(
    window: { time: { min: number; max: number }, freq: { min: number; max: number } },
    parameters: SpectrogramParameters,
    samplerate: number,
    maxWidth = 455,
    maxHeight = 225
) {
    const duration = window.time.max - window.time.min;

    // Calculate time axis pixels using utility function
    const timePixels = calculateTimeFrames(
        duration,
        samplerate,
        parameters.window_size_samples,
        parameters.overlap_percent
    );

    // Calculate frequency axis pixels using utility function
    const { minBin, maxBin } = frequencyRangeToBinRange(
        window.freq.min,
        window.freq.max,
        parameters.window_size_samples,
        samplerate
    );
    const freqPixels = maxBin - minBin;

    // Calculate scaling to fit within max dimensions while maintaining aspect ratio
    const scaleWidth = maxWidth / timePixels;
    const scaleHeight = maxHeight / freqPixels;
    const scale = Math.min(scaleWidth, scaleHeight);

    return {
        width: Math.round(timePixels * scale),
        height: Math.round(freqPixels * scale)
    };
}

export default function SoundEventAnnotationSpectrogramView({
    soundEventAnnotation,
    task,
    samplerate,
    parameters,
    withSpectrogram,
}: {
    soundEventAnnotation: SoundEventAnnotation;
    task: AnnotationTask,
    samplerate: number,
    parameters: SpectrogramParameters;
    withSpectrogram: boolean;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const showPSD = useStore((s) => s.showPSD);
    const setShowPSD = useStore((s) => s.setShowPSD);

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

    // getWindowFromGeometry converts absolute annotation coords to relative [0, duration],
    // then we convert back to absolute for useSpectrogram.
    const window = useMemo(() => {
        const relWindow = getWindowFromGeometry(
            soundEventAnnotation,
            task.start_time,
            task.end_time,
            effectiveSamplerate
        );
        return {
            time: {
                min: relWindow.time.min + task.start_time,
                max: relWindow.time.max + task.start_time,
            },
            freq: relWindow.freq,
        };
    }, [soundEventAnnotation, effectiveSamplerate, task.start_time, task.end_time]);

    const soundEventCoords = useMemo(
        () => getSoundEventCoordinates(soundEventAnnotation, task.start_time),
        [soundEventAnnotation, task.start_time]
    );

    const displayCoords = useMemo(() => window, [window]);

    const dimensions = useMemo(
        () => calculateSpectrogramDimensions(window, selectedParameters, effectiveSamplerate),
        [window, selectedParameters, effectiveSamplerate]
    );

    const spectrogram = useSpectrogram({
        task,
        samplerate: effectiveSamplerate,
        bounds: window,
        initial: window,
        parameters: selectedParameters,
        canvasRef,
        enabled: true,
        withSpectrogram,
        withShortcuts: false,
        fixedAspectRatio: false,
        preload: false,
        toggleFixedAspectRatio: () => { },
        onSegmentsLoaded: () => null,
    });

    const { draw } = spectrogram;

    useCanvas({
        ref: canvasRef as React.RefObject<HTMLCanvasElement>,
        draw: (ctx) => draw(ctx, { withAxes: false })
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
                <div className="flex">
                    <div className="flex flex-col justify-between pr-2 text-right w-16">
                        <span className="text-xs text-stone-600">
                            {displayCoords.freq.max > 0 ? (displayCoords.freq.max / 1000).toFixed(2) + " kHz" : ""}
                        </span>
                        <span className="text-xs text-stone-600 text-center">
                            {displayCoords.freq.max > displayCoords.freq.min ? 
                                "∆: " + ((displayCoords.freq.max - displayCoords.freq.min) / 1000).toFixed(2) + " kHz" : ""}
                        </span>
                        <span className="text-xs text-stone-600">
                            {displayCoords.freq.min > 0 ? (displayCoords.freq.min / 1000).toFixed(2) + " kHz" : ""}
                        </span>
                    </div>

                    <div
                        ref={containerRef}
                        className="relative flex items-center justify-center overflow-clip rounded-md border border-stone-200 dark:border-stone-600"
                        style={{ width: "28rem", height: "14rem" }}
                    >
                        <canvas
                            ref={canvasRef}
                            style={dimensions}
                            className="rounded-md"
                            {...spectrogram.props}
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