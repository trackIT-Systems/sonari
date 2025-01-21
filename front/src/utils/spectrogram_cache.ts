import { useState, useEffect, useRef } from "react";
import { SpectrogramWindow, SpectrogramParameters, Recording } from "@/types";
import api from "@/app/api";

type SpectrogramSegmentKey = string;

/**
 * Cache for spectrogram segments.
 */
class SpectrogramCache {
    private cache: Map<SpectrogramSegmentKey, HTMLImageElement>;
    private loadingQueue: Map<SpectrogramSegmentKey, Promise<void>>;
    private loadLock: Promise<void>;

    constructor() {
        this.cache = new Map();
        this.loadingQueue = new Map();
        this.loadLock = Promise.resolve();
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

    /**
     * Check if a segment is currently being loaded
     */
    isLoading(
        recordingId: string,
        window: SpectrogramWindow,
        parameters: SpectrogramParameters
    ): boolean {
        const key = this.generateKey(recordingId, window, parameters);
        return this.loadingQueue.has(key);
    }

    /**
     * Load a segment into the cache
     */
    async loadSegment(
        recordingId: string,
        window: SpectrogramWindow,
        parameters: SpectrogramParameters,
        url: string
    ): Promise<void> {
        const key = this.generateKey(recordingId, window, parameters);

        // Return existing load promise if already loading
        if (this.loadingQueue.has(key)) {
            return this.loadingQueue.get(key);
        }

        // Skip if already cached
        if (this.cache.has(key)) {
            return;
        }

        // Create a promise that will wait for the previous load to complete
        const loadPromise = new Promise<void>((resolve, reject) => {
            // Wait for the previous load to complete
            this.loadLock = this.loadLock.then(async () => {
                try {
                    const img = new Image();
                    await new Promise((imgResolve, imgReject) => {
                        img.onload = imgResolve;
                        img.onerror = imgReject;
                        img.src = url;
                    });
                    await img.decode();
                    await this.set(recordingId, window, parameters, img);
                    this.loadingQueue.delete(key);
                    resolve();
                } catch (err) {
                    this.loadingQueue.delete(key);
                    reject(err);
                }
            });
        });

        this.loadingQueue.set(key, loadPromise);
        return loadPromise;
    }

    /**
     * Load segments sequentially
     */
    async loadSegmentsSequentially(
        segments: { 
            recordingId: string, 
            window: SpectrogramWindow, 
            parameters: SpectrogramParameters,
            url: string,
        }[]
    ): Promise<void> {
        for (const segment of segments) {
            try {
                await this.loadSegment(
                    segment.recordingId,
                    segment.window,
                    segment.parameters,
                    segment.url
                );
            } catch (error) {
                console.error('Failed to load segment:', error);
                // Continue loading other segments even if one fails
            }
        }
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
    url,
}: {
    recording: Recording;
    window: SpectrogramWindow;
    parameters: SpectrogramParameters;
    withSpectrogram: boolean;
    url: string;
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

        img.src = url;

        return () => {
            imageRef.current = null; // Clear ref on cleanup
        };
    }, [recording.uuid, window, parameters, withSpectrogram, recording]);

    // Don't create new Image() on every render
    return {
        image: currentImage,
        isLoading: loading,
        isError: error !== null,
        error,
    };
}