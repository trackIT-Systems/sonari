"use client";

import { createContext, useContext, type ReactNode } from "react";

import ReleaseNotesDialog from "@/components/ReleaseNotesDialog";
import { useReleaseNotes } from "@/hooks/useReleaseNotes";

type ReleaseNotesContextValue = {
  openReleaseNotes: () => void;
  hasReleaseNotes: boolean;
  releaseTag: string;
};

const ReleaseNotesContext = createContext<ReleaseNotesContextValue | null>(
  null,
);

export function useReleaseNotesContext(): ReleaseNotesContextValue {
  const value = useContext(ReleaseNotesContext);
  if (!value) {
    throw new Error(
      "useReleaseNotesContext must be used within ReleaseNotesProvider",
    );
  }
  return value;
}

export function ReleaseNotesProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const { tag, notes, hasNotes, isOpen, dismiss, open } =
    useReleaseNotes(userId);

  return (
    <ReleaseNotesContext.Provider
      value={{
        openReleaseNotes: open,
        hasReleaseNotes: hasNotes,
        releaseTag: tag,
      }}
    >
      {children}
      {notes ? (
        <ReleaseNotesDialog
          tag={tag}
          notes={notes}
          isOpen={isOpen}
          onClose={dismiss}
        />
      ) : null}
    </ReleaseNotesContext.Provider>
  );
}
