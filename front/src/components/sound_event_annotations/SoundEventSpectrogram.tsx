import { useRef, useMemo } from "react";
import useCanvas from "@/hooks/draw/useCanvas";
import useSpectrogram from "@/hooks/spectrogram/useSpectrogram";
import { DEFAULT_SPECTROGRAM_PARAMETERS } from "@/api/spectrograms";
import type { Recording, SoundEventAnnotation, SpectrogramParameters } from "@/types";
import { H4 } from "../Headings";
import { ExplorationIcon } from "../icons";

function getWindowFromGeometry(annotation: SoundEventAnnotation, recording: Recording) {
    const { geometry, geometry_type } = annotation.sound_event;
    switch (geometry_type) {
        case "TimeInterval":
            const ti_coordinates = geometry.coordinates as [number, number];
            var duration_margin = (ti_coordinates[1] - ti_coordinates[0]) * 0.1
            return {
                time: {
                    min: Math.max(0, ti_coordinates[0] - duration_margin),
                    max: Math.min(ti_coordinates[1] + duration_margin, recording.duration),
                },
                freq: {
                    min: 0,
                    max: recording.samplerate / 2,
                },
            };

        case "BoundingBox":
            const bb_coordinates = geometry.coordinates as [number, number, number, number];
            var bandwidth_margin = (bb_coordinates[3] - bb_coordinates[1]) * 0.1;
            var duration_margin = (bb_coordinates[2] - bb_coordinates[0]) * 0.1
            return {
                time: {
                    min: Math.max(0, bb_coordinates[0] - duration_margin),
                    max: Math.min(bb_coordinates[2] + duration_margin, recording.duration),
                },
                freq: {
                    min: Math.max(0, bb_coordinates[1] - bandwidth_margin),
                    max: Math.min(bb_coordinates[3] + bandwidth_margin, recording.samplerate / 2),
                },
            };
        default:
            return {
                time: {
                    min: 0,
                    max: recording.duration,
                },
                freq: {
                    min: 0,
                    max: recording.samplerate / 2,
                },
            }
    }
}

function getSoundEventCoordinates(annotation: SoundEventAnnotation) {
    const { geometry, geometry_type } = annotation.sound_event;
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
    // Convert window size from seconds to samples
    const windowSizeSamples = Math.floor(parameters.window_size * samplerate);

    // Calculate hop length in samples (hop_size is a fraction of window size)
    const hopLengthSamples = Math.floor(windowSizeSamples * parameters.hop_size);

    // Calculate time axis pixels
    const duration = window.time.max - window.time.min;
    const timePixels = Math.ceil((duration * samplerate) / hopLengthSamples);

    // Calculate frequency axis pixels
    const freqBins = Math.floor(windowSizeSamples / 2) + 1;
    const minBin = Math.floor((window.freq.min * windowSizeSamples) / samplerate);
    const maxBin = Math.ceil((window.freq.max * windowSizeSamples) / samplerate);
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

export default function SoundEventSpectrogramView({
    soundEventAnnotation,
    recording,
    parameters = DEFAULT_SPECTROGRAM_PARAMETERS,
    withSpectrogram,
}: {
    soundEventAnnotation: SoundEventAnnotation;
    recording: Recording;
    parameters?: SpectrogramParameters;
    withSpectrogram: boolean;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const window = useMemo(
        () => getWindowFromGeometry(soundEventAnnotation, recording),
        [soundEventAnnotation, recording]
    );

    const soundEventCoords = useMemo(
        () => getSoundEventCoordinates(soundEventAnnotation),
        [soundEventAnnotation]
    );

    const dimensions = useMemo(
        () => calculateSpectrogramDimensions(window, parameters, recording.samplerate),
        [window, parameters, recording.samplerate]
    );

    const spectrogram = useSpectrogram({
        recording,
        dimensions,
        bounds: window,
        initial: window,
        parameters,
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
                    Sound Event Spectrogram
                </H4>
            </div>
            <div className="flex">
                <div className="flex flex-col justify-between pr-2 text-right w-16">
                    <span className="text-xs text-stone-600">
                        {soundEventCoords.freq.max > 0 ? (soundEventCoords.freq.max / 1000).toFixed(2) + " kHz" : ""}
                    </span>
                    <span className="text-xs text-stone-600 text-center">
                        {soundEventCoords.freq.max > soundEventCoords.freq.min ? 
                            ((soundEventCoords.freq.max - soundEventCoords.freq.min) / 1000).toFixed(2) + " kHz" : ""}
                    </span>
                    <span className="text-xs text-stone-600">
                        {soundEventCoords.freq.min > 0 ? (soundEventCoords.freq.min / 1000).toFixed(2) + " kHz" : ""}
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
                        ((soundEventCoords.time.max - soundEventCoords.time.min) * 1000).toFixed(0) + "ms" : ""}
                </span>
                <span className="text-xs text-stone-600">{(soundEventCoords.time.max * 1000).toFixed(0)}ms</span>
            </div>
        </div>
    );
}