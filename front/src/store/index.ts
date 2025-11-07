// Global state for the application
import { useEffect, useState } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { type ClipboardSlice, createClipboardSlice } from "./clipboard";
import { type SessionSlice, createSessionSlice } from "./session";
import { type SpectrogramSlice, createSpectrogramSlice } from "./spectrogram";

type Store = SessionSlice & ClipboardSlice & SpectrogramSlice;

const useStore = create<Store>()(
  persist(
    (...a) => ({
      ...createSessionSlice(...a),
      ...createClipboardSlice(...a),
      ...createSpectrogramSlice(...a),
    }),
    {
      name: "sonari-storage",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export default useStore;
