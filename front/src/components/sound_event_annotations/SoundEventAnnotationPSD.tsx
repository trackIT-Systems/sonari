import { useEffect, useMemo, useState } from "react";
import api from "@/app/api";
import { applyAutoSTFT } from "@/api/spectrograms";
import type { AnnotationTask, SoundEventAnnotation, SpectrogramParameters } from "@/types";
import type { PSDParameters } from "@/api/psd";

function formatDb(value: number | null): string {
    if (value === null) return "–";
    return `${value.toFixed(0)} dB`;
}

function getTimeRangeFromGeometry(annotation: SoundEventAnnotation, taskStartTime: number, taskEndTime: number) {
    const { geometry, geometry_type } = annotation;

    switch (geometry_type) {
        case "TimeInterval":
            const ti_coordinates = geometry.coordinates as [number, number];
            return {
                min: taskStartTime + ti_coordinates[0],
                max: taskStartTime + ti_coordinates[1],
            };

        case "BoundingBox":
            const bb_coordinates = geometry.coordinates as [number, number, number, number];
            return {
                min: taskStartTime + bb_coordinates[0],
                max: taskStartTime + bb_coordinates[2],
            };

        case "TimeStamp":
            const time = geometry.coordinates as number;
            // For a timestamp, use a small window around it
            const margin = 0.05; // 50ms
            return {
                min: Math.max(taskStartTime, taskStartTime + time - margin),
                max: Math.min(taskEndTime, taskStartTime + time + margin),
            };

        case "Point":
            const point_coordinates = geometry.coordinates as [number, number];
            // For a point, use a small window around the time
            const pointMargin = 0.05;
            return {
                min: Math.max(taskStartTime, taskStartTime + point_coordinates[0] - pointMargin),
                max: Math.min(taskEndTime, taskStartTime + point_coordinates[0] + pointMargin),
            };

        default:
            // Default to full task duration
            return {
                min: taskStartTime,
                max: taskEndTime,
            };
    }
}

function getFrequencyRangeFromGeometry(annotation: SoundEventAnnotation, samplerate: number) {
    const { geometry, geometry_type } = annotation;

    switch (geometry_type) {
        case "BoundingBox":
            const bb_coordinates = geometry.coordinates as [number, number, number, number];
            return {
                min: bb_coordinates[1],
                max: bb_coordinates[3],
            };

        case "Point":
            const point_coordinates = geometry.coordinates as [number, number];
            // For a point, show a range around the frequency
            const margin = 1000; // 1kHz margin
            return {
                min: Math.max(0, point_coordinates[1] - margin),
                max: Math.min(samplerate / 2, point_coordinates[1] + margin),
            };

        default:
            // Full frequency range
            return {
                min: 0,
                max: samplerate / 2,
            };
    }
}

function formatFrequency(freq: number): string {
    if (freq >= 1000) {
        return `${(freq / 1000).toFixed(1)} kHz`;
    }
    return `${freq.toFixed(0)} Hz`;
}

export default function SoundEventAnnotationPSD({
    soundEventAnnotation,
    task,
    samplerate,
    parameters,
    width = 448,
    height = 224,
}: {
    soundEventAnnotation: SoundEventAnnotation;
    task: AnnotationTask;
    samplerate: number;
    parameters: SpectrogramParameters;
    width?: number;
    height?: number;
}) {
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [psdMin, setPsdMin] = useState<number | null>(null);
    const [psdMax, setPsdMax] = useState<number | null>(null);

    const selectedParameters = useMemo(() => {
        return applyAutoSTFT(parameters, samplerate);
    }, [parameters, samplerate]);

    const timeRange = useMemo(
        () => getTimeRangeFromGeometry(soundEventAnnotation, task.start_time, task.end_time),
        [soundEventAnnotation, task.start_time, task.end_time]
    );

    const frequencyRange = useMemo(
        () => getFrequencyRangeFromGeometry(soundEventAnnotation, samplerate),
        [soundEventAnnotation, samplerate]
    );

    const psdParameters: PSDParameters = useMemo(() => ({
        width,
        height,
        freq_min: frequencyRange.min,
        freq_max: frequencyRange.max,
    }), [width, height, frequencyRange]);

    const psdUrl = useMemo(() => {
        return api.psd.getUrl({
            recording_id: task.recording_id,
            segment: timeRange,
            parameters: selectedParameters,
            psdParameters,
        });
    }, [task.recording_id, timeRange, selectedParameters, psdParameters]);

    // Fetch PSD image and read dB range from headers
    useEffect(() => {
        let cancelled = false;
        let blobUrl: string | null = null;

        setIsLoading(true);
        setHasError(false);
        setPsdMin(null);
        setPsdMax(null);

        fetch(psdUrl, { credentials: "include" })
            .then(async (response) => {
                if (cancelled) return;
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                // Read dB range from headers
                const minHeader = response.headers.get("X-PSD-Min");
                const maxHeader = response.headers.get("X-PSD-Max");
                if (minHeader) setPsdMin(parseFloat(minHeader));
                if (maxHeader) setPsdMax(parseFloat(maxHeader));

                // Create blob URL for image
                const blob = await response.blob();
                if (cancelled) return;
                blobUrl = URL.createObjectURL(blob);
                setImageSrc(blobUrl);
                setIsLoading(false);
            })
            .catch((err) => {
                if (cancelled) return;
                console.error("Failed to load PSD:", err);
                setHasError(true);
                setIsLoading(false);
            });

        return () => {
            cancelled = true;
            if (blobUrl) {
                URL.revokeObjectURL(blobUrl);
            }
        };
    }, [psdUrl]);

    // Clean up blob URL when imageSrc changes
    useEffect(() => {
        return () => {
            if (imageSrc) {
                URL.revokeObjectURL(imageSrc);
            }
        };
    }, [imageSrc]);

    return (
        <div className="flex flex-col">
            <div className="flex">
                {/* Y-axis label */}
                <div className="flex flex-col justify-between pr-2 text-right w-16">
                    <span className="text-xs text-stone-600">{formatDb(psdMax)}</span>
                    <span className="text-xs text-stone-600 text-center">
                        {psdMax !== null && psdMin !== null ? "∆: " + formatDb(psdMax - psdMin) : "–"}
                    </span>
                    <span className="text-xs text-stone-600">{formatDb(psdMin)}</span>
                </div>

                {/* Plot area */}
                <div
                    className="relative flex items-center justify-center overflow-clip rounded-md border border-stone-200 dark:border-stone-600"
                    style={{ width: `${width}px`, height: `${height}px` }}
                >
                    {imageSrc && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={imageSrc}
                            alt="Power Spectral Density"
                            style={{ width: `${width}px`, height: `${height}px` }}
                            className="rounded-md"
                        />
                    )}
                    {isLoading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-stone-100 dark:bg-stone-800 bg-opacity-50">
                            <span className="text-sm text-stone-500">Loading PSD...</span>
                        </div>
                    )}
                    {hasError && (
                        <div className="absolute inset-0 flex items-center justify-center bg-stone-100 dark:bg-stone-800 bg-opacity-50">
                            <span className="text-sm text-red-500">Failed to load PSD</span>
                        </div>
                    )}
                </div>
            </div>

            {/* X-axis labels (Frequency) */}
            <div className="flex justify-between pl-16 pr-2 pt-2">
                <span className="text-xs text-stone-600">{formatFrequency(frequencyRange.min)}</span>
                <span className="text-xs text-stone-600 text-center">
                    {frequencyRange.max > frequencyRange.min 
                        ? "∆: " + formatFrequency(frequencyRange.max - frequencyRange.min) 
                        : ""}
                </span>
                <span className="text-xs text-stone-600">{formatFrequency(frequencyRange.max)}</span>
            </div>
        </div>
    );
}
