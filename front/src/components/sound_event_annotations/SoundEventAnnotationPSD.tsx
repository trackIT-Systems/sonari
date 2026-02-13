import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "@/app/api";
import { applyAutoSTFT } from "@/api/spectrograms";
import usePositionPopover from "@/hooks/utils/usePositionPopover";
import type { AnnotationTask, SoundEventAnnotation, SpectrogramParameters } from "@/types";
import type { PSDParameters } from "@/api/psd";

function formatDb(value: number | null): string {
    if (value === null) return "–";
    return `${value.toFixed(0)} dB`;
}

function getTimeRangeFromGeometry(annotation: SoundEventAnnotation, taskStartTime: number, taskEndTime: number, minDuration: number = 0.01) {
    const { geometry, geometry_type } = annotation;

    let timeRange: { min: number; max: number };

    switch (geometry_type) {
        case "TimeInterval":
            const ti_coordinates = geometry.coordinates as [number, number];
            timeRange = {
                min: taskStartTime + ti_coordinates[0],
                max: taskStartTime + ti_coordinates[1],
            };
            break;

        case "BoundingBox":
            const bb_coordinates = geometry.coordinates as [number, number, number, number];
            timeRange = {
                min: taskStartTime + bb_coordinates[0],
                max: taskStartTime + bb_coordinates[2],
            };
            break;

        case "TimeStamp":
            const time = geometry.coordinates as number;
            // For a timestamp, use a small window around it
            const margin = 0.05; // 50ms
            timeRange = {
                min: Math.max(taskStartTime, taskStartTime + time - margin),
                max: Math.min(taskEndTime, taskStartTime + time + margin),
            };
            break;

        case "Point":
            const point_coordinates = geometry.coordinates as [number, number];
            // For a point, use a small window around the time
            const pointMargin = 0.05;
            timeRange = {
                min: Math.max(taskStartTime, taskStartTime + point_coordinates[0] - pointMargin),
                max: Math.min(taskEndTime, taskStartTime + point_coordinates[0] + pointMargin),
            };
            break;

        default:
            // Default to full task duration
            timeRange = {
                min: taskStartTime,
                max: taskEndTime,
            };
    }

    // Ensure the time range is at least minDuration
    const duration = timeRange.max - timeRange.min;
    if (duration < minDuration) {
        const center = (timeRange.min + timeRange.max) / 2;
        const halfDuration = minDuration / 2;
        
        let newMin = center - halfDuration;
        let newMax = center + halfDuration;
        
        // Adjust if we're outside task boundaries
        if (newMin < taskStartTime) {
            newMin = taskStartTime;
            newMax = Math.min(taskEndTime, taskStartTime + minDuration);
        }
        
        if (newMax > taskEndTime) {
            newMax = taskEndTime;
            newMin = Math.max(taskStartTime, taskEndTime - minDuration);
        }
        
        timeRange = {
            min: newMin,
            max: newMax,
        };
    }

    return timeRange;
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
    const imageRef = useRef<HTMLImageElement>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [psdMin, setPsdMin] = useState<number | null>(null);
    const [psdMax, setPsdMax] = useState<number | null>(null);

    const selectedParameters = useMemo(() => {
        return applyAutoSTFT(parameters, samplerate);
    }, [parameters, samplerate]);

    // Calculate minimum duration based on window size and sample rate
    const minDuration = useMemo(() => {
        const windowDuration = selectedParameters.window_size_samples / samplerate;
        return Math.max(0.02, windowDuration * 3); // At least 3 windows or 20ms
    }, [selectedParameters.window_size_samples, samplerate]);

    const timeRange = useMemo(
        () => getTimeRangeFromGeometry(soundEventAnnotation, task.start_time, task.end_time, minDuration),
        [soundEventAnnotation, task.start_time, task.end_time, minDuration]
    );

    const frequencyRange = useMemo(
        () => getFrequencyRangeFromGeometry(soundEventAnnotation, samplerate),
        [soundEventAnnotation, samplerate]
    );

    // Formatter for frequency (X-axis)
    const formatFreqValue = useCallback((freq: number) => {
        if (freq >= 1000) {
            return `${(freq / 1000).toFixed(1)} kHz`;
        }
        return `${freq.toFixed(0)} Hz`;
    }, []);

    // Formatter for dB (Y-axis)
    const formatDbValue = useCallback((value: number) => {
        return `${value.toFixed(0)} dB`;
    }, []);

    // Position popover for hover coordinates
    const positionPopoverProps = usePositionPopover(imageRef, {
        xBounds: frequencyRange,
        yBounds: { min: psdMin ?? 0, max: psdMax ?? 0 },
        formatX: formatFreqValue,
        formatY: formatDbValue,
        enabled: psdMin !== null && psdMax !== null && !isLoading,
    });

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

        // Use authenticated API method to get blob
        api.psd.getBlob({
            recording_id: task.recording_id,
            segment: timeRange,
            parameters: selectedParameters,
            psdParameters,
        })
            .then(({ blob, psdMin, psdMax }) => {
                if (cancelled) return;

                // Set dB range from headers
                if (psdMin !== null) setPsdMin(psdMin);
                if (psdMax !== null) setPsdMax(psdMax);

                // Create blob URL for image
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
    }, [task.recording_id, timeRange, selectedParameters, psdParameters]);

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
                            ref={imageRef}
                            src={imageSrc}
                            alt="Power Spectral Density"
                            style={{ width: `${width}px`, height: `${height}px`, cursor: "crosshair" }}
                            className="rounded-md"
                            {...positionPopoverProps}
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
