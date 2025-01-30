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

export const useHydration = () => {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const unsubHydrate = useStore.persist.onHydrate(() => setHydrated(false));

    const unsubFinishHydration = useStore.persist.onFinishHydration(() =>
      setHydrated(true),
    );

    setHydrated(useStore.persist.hasHydrated());

    return () => {
      unsubHydrate();
      unsubFinishHydration();
    };
  }, []);

  return hydrated;
};

export default useStore;
