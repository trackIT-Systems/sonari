// Global state for the application
import { create } from "zustand";
import {
  createJSONStorage,
  persist,
  type StateStorage,
} from "zustand/middleware";

import { type ClipboardSlice, createClipboardSlice } from "./clipboard";
import { type SpectrogramSlice, createSpectrogramSlice } from "./spectrogram";

type Store = ClipboardSlice & SpectrogramSlice;

const STORAGE_KEY = "sonari-storage";

/**
 * Error-safe storage wrapper that catches exceptions during localStorage operations.
 * This prevents crashes when localStorage is unavailable (private browsing)
 * or when stored data is corrupted.
 */
const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
    } catch {
      // Silently fail - localStorage might be full or unavailable
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch {
      // Silently fail
    }
  },
};

const useStore = create<Store>()(
  persist(
    (...a) => ({
      ...createClipboardSlice(...a),
      ...createSpectrogramSlice(...a),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => safeStorage),
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          // Clear corrupted storage on hydration error
          try {
            localStorage.removeItem(STORAGE_KEY);
          } catch {
            // Ignore - localStorage might be unavailable
          }
        }
      },
    },
  ),
);

export default useStore;
