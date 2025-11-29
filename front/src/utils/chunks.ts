import { SPECTROGRAM_CANVAS_DIMENSIONS } from "@/constants";
import type { Interval } from "@/types";

/**
 * Number of extra STFT windows to include as buffer on each side of a chunk
 */
const SPECTROGRAM_CHUNK_BUFFER = 3;

/**
 * Represents a chunk of spectrogram data with its time interval and buffer
 */
export interface Chunk {
  /** The actual time interval covered by this chunk */
  interval: Interval;
  /** The extended interval including buffer zones */
  buffer: Interval;
  /** The index of this chunk in the sequence */
  index: number;
}

/**
 * Core logic for calculating chunks based on pixel count
 */
function calculateChunksFromPixels({
  duration,
  windowSize,
  overlap,
  samplerate,
  chunkPixels,
}: {
  duration: number;
  windowSize: number;
  overlap: number;
  samplerate: number;
  chunkPixels: number;
}): Chunk[] {
  // Height of spectrogram = number of frequency bins
  const freqBins = windowSize / 2;
  
  // Calculate how many time bins we need to achieve target pixel count
  const timeBins = chunkPixels / freqBins;
  
  // Duration of each hop between STFT windows
  const hopSize = (1 - overlap) * (windowSize / samplerate);
  
  // Duration covered by one chunk
  const chunkDuration = timeBins * hopSize;
  
  // Buffer duration to add on each side
  const bufferDuration = SPECTROGRAM_CHUNK_BUFFER * hopSize + (windowSize / samplerate);
  
  // Calculate number of chunks needed
  const numChunks = Math.ceil(duration / chunkDuration);
  
  // Generate chunks
  return Array.from({ length: numChunks }, (_, i) => {
    const startTime = i * chunkDuration;
    const endTime = Math.min((i + 1) * chunkDuration, duration);
    
    return {
      interval: {
        min: startTime,
        max: endTime,
      },
      buffer: {
        min: Math.max(0, startTime - bufferDuration),
        max: Math.min(duration, endTime + bufferDuration),
      },
      index: i,
    };
  });
}

/**
 * Calculates the time intervals for spectrogram chunks based on recording and settings.
 * 
 * Uses pixel-based sizing where each chunk targets SPECTROGRAM_CANVAS_DIMENSIONS.height × SPECTROGRAM_CANVAS_DIMENSIONS.height pixels.
 * This creates consistent-sized chunks regardless of spectrogram parameters.
 * 
 * @param duration - The duration of the recording in seconds
 * @param windowSize - The size of each STFT window in samples
 * @param overlap - The overlap fraction between consecutive windows (0-1)
 * @param samplerate - The audio sample rate in Hz
 * @returns Array of chunks with their time intervals and buffers
 */
export function calculateSpectrogramChunks(params: {
  duration: number;
  windowSize: number;
  overlap: number;
  samplerate: number;
}): Chunk[] {
  const chunkPixels = SPECTROGRAM_CANVAS_DIMENSIONS.height * SPECTROGRAM_CANVAS_DIMENSIONS.height;
  return calculateChunksFromPixels({ ...params, chunkPixels });
}

/**
 * Determines if a chunk's interval intersects with a given time range
 */
function chunkIntersectsTimeRange(
  chunk: Chunk,
  timeMin: number,
  timeMax: number,
): boolean {
  return !(chunk.interval.max <= timeMin || chunk.interval.min >= timeMax);
}

/**
 * Finds all chunks that intersect with the given viewport time range
 */
export function getVisibleChunks(
  chunks: Chunk[],
  viewportTimeMin: number,
  viewportTimeMax: number,
): Chunk[] {
  return chunks.filter(chunk => 
    chunkIntersectsTimeRange(chunk, viewportTimeMin, viewportTimeMax)
  );
}

/**
 * Calculates the time intervals for waveform chunks based on recording and settings.
 * 
 * Uses moderately sized chunks optimized for waveforms - balances progressive loading
 * with reducing HTTP request overhead. Each chunk is approximately 2/3 of canvas width
 * to ensure 1-2 chunks are visible in viewport for reasonable progressive loading
 * while keeping total request count manageable.
 * 
 * @param duration - The duration of the recording in seconds
 * @param windowSize - The size of each STFT window in samples
 * @param overlap - The overlap fraction between consecutive windows (0-1)
 * @param samplerate - The audio sample rate in Hz
 * @returns Array of chunks with their time intervals and buffers
 */
export function calculateWaveformChunks(params: {
  duration: number;
  windowSize: number;
  overlap: number;
  samplerate: number;
}): Chunk[] {
  // For waveforms, target ~2/3 canvas width chunks
  // Balance between progressive loading and minimizing HTTP request overhead
  const targetTimePixels = (SPECTROGRAM_CANVAS_DIMENSIONS.width * 2) / 3;
  const chunkPixels = targetTimePixels * SPECTROGRAM_CANVAS_DIMENSIONS.height;
  return calculateChunksFromPixels({ ...params, chunkPixels });
}

/**
 * Gets chunks to load: visible chunks plus their immediate neighbors for preloading
 */
export function getChunksToLoad(
  chunks: Chunk[],
  visibleChunks: Chunk[],
): Chunk[] {
  const indices = new Set<number>();
  
  // Add all visible chunk indices
  visibleChunks.forEach(chunk => indices.add(chunk.index));
  
  // Add neighbors for preloading (±2 chunks)
  visibleChunks.forEach(chunk => {
    for (let offset = 1; offset <= 2; offset++) {
      if (chunk.index - offset >= 0) {
        indices.add(chunk.index - offset);
      }
      if (chunk.index + offset < chunks.length) {
        indices.add(chunk.index + offset);
      }
    }
  });
  
  // Return chunks in order
  return Array.from(indices)
    .sort((a, b) => a - b)
    .map(index => chunks[index]);
}

