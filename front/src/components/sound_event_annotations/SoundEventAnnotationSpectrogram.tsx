import { useRef, useMemo, useState } from "react";
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

function getWindowFromGeometry(annotation: SoundEventAnnotation, duration: number, samplerate: number) {
    const { geometry, geometry_type } = annotation;
    switch (geometry_type) {
        case "TimeInterval":
            const ti_coordinates = geometry.coordinates as [number, number];
            var duration_margin = (ti_coordinates[1] - ti_coordinates[0]) * 0.1
            return {
                time: {
                    min: Math.max(0, ti_coordinates[0] - duration_margin),
                    max: Math.min(ti_coordinates[1] + duration_margin, duration),
                },
                freq: {
                    min: 0,
                    max: samplerate / 2,
                },
            };

        case "BoundingBox":
            const bb_coordinates = geometry.coordinates as [number, number, number, number];
            var bandwidth_margin = (bb_coordinates[3] - bb_coordinates[1]) * 0.1;
            var duration_margin = (bb_coordinates[2] - bb_coordinates[0]) * 0.1
            return {
                time: {
                    min: Math.max(0, bb_coordinates[0] - duration_margin),
                    max: Math.min(bb_coordinates[2] + duration_margin, duration),
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

function getSoundEventCoordinates(annotation: SoundEventAnnotation) {
    const { geometry, geometry_type } = annotation;
    switch (geometry_type) {
        case "TimeInterval":
            const ti_coordinates = geometry.coordinates as [number, number];
            return {
                time: {
                    min: ti_coordinates[0],
                    max: ti_coordinates[1],
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
                    min: bb_coordinates[0],
                    max: bb_coordinates[2],
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
                    min: time,
                    max: time,
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
                    min: point_coordinates[0],
                    max: point_coordinates[0],
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
    const [showPSD, setShowPSD] = useState(false);

    // Keyboard shortcut to toggle PSD view
    useKeyPressEvent(useKeyFilter({ key: PSD_TOGGLE_SHORTCUT }), () => setShowPSD((v) => !v));

    const selectedParameters = useMemo(() => {
        // Apply auto STFT calculation if enabled
        return applyAutoSTFT(parameters, samplerate);
    }, [parameters, samplerate]);


    const window = useMemo(
        () => getWindowFromGeometry(soundEventAnnotation, task.end_time - task.start_time, samplerate),
        [soundEventAnnotation, samplerate, task.start_time, task.end_time]
    );

    const soundEventCoords = useMemo(
        () => getSoundEventCoordinates(soundEventAnnotation),
        [soundEventAnnotation]
    );

    const displayCoords = useMemo(() => window, [window]);

    const dimensions = useMemo(
        () => calculateSpectrogramDimensions(window, selectedParameters, samplerate),
        [window, selectedParameters, samplerate]
    );

    const spectrogram = useSpectrogram({
        task,
        samplerate,
        bounds: window,
        initial: window,
        parameters: selectedParameters,
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
                <button
                    onClick={() => setShowPSD(!showPSD)}
                    className="min-w-[8rem] px-2 py-1 text-xs font-medium rounded-md border transition-colors
                        border-stone-300 dark:border-stone-600
                        bg-stone-100 dark:bg-stone-700
                        hover:bg-stone-200 dark:hover:bg-stone-600
                        text-stone-700 dark:text-stone-300"
                >
                    {showPSD ? "Show Spectrogram" : "Show PSD"}
                </button>
            </div>
            {/* PSD view - hidden when showing spectrogram */}
            <div style={{ display: showPSD ? "block" : "none" }}>
                <SoundEventAnnotationPSD
                    soundEventAnnotation={soundEventAnnotation}
                    task={task}
                    samplerate={samplerate}
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