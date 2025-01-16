import { useState, useEffect } from "react";
import { SpectrogramWindow, SpectrogramParameters, Recording } from "@/types";
import api from "@/app/api";

type SpectrogramSegmentKey = string;

/**
 * Cache for spectrogram segments.
 */
class SpectrogramCache {
    private cache: Map<SpectrogramSegmentKey, HTMLImageElement>;

    constructor() {
        this.cache = new Map();
    }

    /**
     * Generate a unique key for a spectrogram segment
     */
    private static generateKey(
        recordingId: string,
        window: SpectrogramWindow,
        parameters: SpectrogramParameters
    ): SpectrogramSegmentKey {
        return JSON.stringify({
            recordingId,
            window,
            parameters,
        });
    }

    /**
     * Get an image from the cache. Updates last accessed time.
     */
    get(
        recordingId: string,
        window: SpectrogramWindow,
        parameters: SpectrogramParameters
    ): HTMLImageElement | null {
        const key = SpectrogramCache.generateKey(recordingId, window, parameters);
        const entry = this.cache.get(key);
        
        if (entry) {
            return entry;
        }

        return null;
    }

    /**
     * Add an image to the cache
     */
    set(
        recordingId: string,
        window: SpectrogramWindow,
        parameters: SpectrogramParameters,
        image: HTMLImageElement
    ): void {
        const key = SpectrogramCache.generateKey(recordingId, window, parameters);
        this.cache.set(key, image);
    }


    /**
     * Clear the entire cache
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * Get the current size of the cache
     */
    size(): number {
        return this.cache.size;
    }
}

// Create a singleton instance
export const spectrogramCache = new SpectrogramCache();

/**
 * Hook to use the spectrogram cache
 */
export function useSpectrogramCache({
    recording,
    window,
    parameters,
    withSpectrogram,
}: {
    recording: Recording;
    window: SpectrogramWindow;
    parameters: SpectrogramParameters;
    withSpectrogram: boolean;
}) {
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        if (!withSpectrogram) {
            setLoading(false);
            return;
        }

        // Check cache first
        const cachedImage = spectrogramCache.get(recording.uuid, window, parameters);
        if (cachedImage) {
            setLoading(false);
            setError(null);
            return;
        }

        // If not in cache, load it
        const img = new Image();

        img.onload = () => {
            spectrogramCache.set(recording.uuid, window, parameters, img);
            setLoading(false);
            setError(null);
        };

        img.onerror = () => {
            setLoading(false);
            setError("Failed to load spectrogram");
        };

        img.src = api.spectrograms.getUrl({ recording, segment: window.time, parameters })

        return () => {
            img.src = '';
        };
    }, [recording.uuid, window, parameters, withSpectrogram]);

    return {
        image: spectrogramCache.get(recording.uuid, window, parameters) || new Image(),
        isLoading: loading,
        isError: error !== null,
        error,
    };
}