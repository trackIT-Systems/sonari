import { useKeyPressEvent } from "react-use";

import useKeyFilter from "@/hooks/utils/useKeyFilter";

import type { KeyShortcut } from "@/hooks/utils/useKeyFilter";
import { PLAY_SHORTCUT } from "@/utils/keyboard";

export const AUDIO_KEY_SHORTCUTS: KeyShortcut[] = [
  {
    label: "Play/Pause",
    shortcut: PLAY_SHORTCUT,
    description: "Play or pause the audio",
  },
];

export default function useAnnotateClipKeyShortcuts(props: {
  onTogglePlay: () => void;
  enabled?: boolean;
}) {
  const { onTogglePlay, enabled = true } = props;
  useKeyPressEvent(
    useKeyFilter({ enabled, key: PLAY_SHORTCUT, preventDefault: true }),
    onTogglePlay,
  );
}
