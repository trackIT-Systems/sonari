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

/** Time span of a sound event; its coordinates are absolute recording times, like the task's. */
function getTimeRangeFromGeometry(annotation: SoundEventAnnotation, taskStartTime: number, taskEndTime: number, minDuration: number = 0.01) {
    const { geometry, geometry_type } = annotation;

    let timeRange: { min: number; max: number };

    switch (geometry_type) {
        case "TimeInterval":
            const ti_coordinates = geometry.coordinates as [number, number];
            timeRange = {
                min: ti_coordinates[0],
                max: ti_coordinates[1],
            };
            break;

        case "BoundingBox":
            const bb_coordinates = geometry.coordinates as [number, number, number, number];
            timeRange = {
                min: bb_coordinates[0],
                max: bb_coordinates[2],
            };
            break;

        case "TimeStamp":
            const time = geometry.coordinates as number;
            // For a timestamp, use a small window around it
            const margin = 0.05; // 50ms
            timeRange = {
                min: Math.max(taskStartTime, time - margin),
                max: Math.min(taskEndTime, time + margin),
            };
            break;

        case "Point":
            const point_coordinates = geometry.coordinates as [number, number];
            // For a point, use a small window around the time
            const pointMargin = 0.05;
            timeRange = {
                min: Math.max(taskStartTime, point_coordinates[0] - pointMargin),
                max: Math.min(taskEndTime, point_coordinates[0] + pointMargin),
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

/**
 * Fixed frequency axis of the PSD (Hz), the same for every sound event so
 * spectra can be compared at a glance. Above the recording's Nyquist
 * frequency the plot stays empty.
 */
const PSD_FREQUENCY_RANGE = { min: 10_000, max: 110_000 };

/** Reference frequency marked on the PSD (Hz) */
const PSD_REFERENCE_FREQUENCY = 40_000;

/** Horizontal position of a frequency on the PSD axis, in percent of its width */
function frequencyPercent(freq: number): number {
    return ((freq - PSD_FREQUENCY_RANGE.min) / (PSD_FREQUENCY_RANGE.max - PSD_FREQUENCY_RANGE.min)) * 100;
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

    const frequencyRange = PSD_FREQUENCY_RANGE;

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
        // One grid for the plot and its axes: the frequency axis spans exactly the
        // plot's width, however narrow the dB labels' column becomes
        <div className="grid" style={{ gridTemplateColumns: `auto ${width}px` }}>
                {/* Y-axis label */}
                <div className="flex flex-col justify-between pr-2 text-right">
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
                    {/* Reference line; lets hover events through to the image */}
                    <div
                        aria-hidden
                        className="pointer-events-none absolute inset-y-0 border-l border-dashed border-sky-400/70"
                        style={{ left: `${frequencyPercent(PSD_REFERENCE_FREQUENCY)}%` }}
                    />
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

            {/* X-axis labels (Frequency), under the plot area */}
            <div className="relative col-start-2 h-6 pt-2">
                <span className="absolute left-0 text-xs text-stone-600">{formatFrequency(frequencyRange.min)}</span>
                <span
                    className="absolute -translate-x-1/2 text-xs text-sky-600 dark:text-sky-400"
                    style={{ left: `${frequencyPercent(PSD_REFERENCE_FREQUENCY)}%` }}
                >
                    {formatFrequency(PSD_REFERENCE_FREQUENCY)}
                </span>
                <span className="absolute right-0 text-xs text-stone-600">{formatFrequency(frequencyRange.max)}</span>
            </div>
        </div>
    );
}
