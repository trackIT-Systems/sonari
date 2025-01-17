import { useState, useEffect, useRef } from "react";
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
    generateKey(
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
        const key = this.generateKey(recordingId, window, parameters);
        const entry = this.cache.get(key);

        if (entry) {
            return entry;
        }

        return null;
    }

    /**
     * Add an image to the cache
     */
    async set(
        recordingId: string,
        window: SpectrogramWindow,
        parameters: SpectrogramParameters,
        image: HTMLImageElement
    ): Promise<void> {
        try {
            if (!image.complete) {
                await new Promise((resolve, reject) => {
                    image.onload = resolve;
                    image.onerror = reject;
                });
            }
            await image.decode(); // Ensure image is fully decoded
            const key = this.generateKey(recordingId, window, parameters);
            this.cache.set(key, image);
        } catch (error) {
            console.error('Failed to cache image:', error);
        }
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
    const imageRef = useRef<HTMLImageElement | null>(null); // Add this
    const [currentImage, setCurrentImage] = useState<HTMLImageElement | null>(null);

    useEffect(() => {
        if (!withSpectrogram) {
            setLoading(false);
            return;
        }

        // Check cache first
        const cachedImage = spectrogramCache.get(recording.uuid, window, parameters);
        if (cachedImage) {
            setCurrentImage(cachedImage);
            setLoading(false);
            setError(null);
            return;
        }

        // Create image only once per effect
        if (!imageRef.current) {
            imageRef.current = new Image();
        }
        const img = imageRef.current;

        img.onload = async () => {
            try {
                await img.decode();
                await spectrogramCache.set(recording.uuid, window, parameters, img);
                setCurrentImage(img);
                setLoading(false);
                setError(null);
            } catch (err) {
                setError("Failed to decode image");
                setLoading(false);
            }
        };

        img.onerror = () => {
            setLoading(false);
            setError("Failed to load spectrogram");
        };

        img.src = api.spectrograms.getUrl({
            recording,
            segment: window.time,
            parameters
        });

        return () => {
            img.src = '';
            imageRef.current = null; // Clear ref on cleanup
        };
    }, [recording.uuid, window, parameters, withSpectrogram]);

    // Don't create new Image() on every render
    return {
        image: currentImage,
        isLoading: loading,
        isError: error !== null,
        error,
    };
}