import { useKeyPressEvent } from "react-use";

import useKeyFilter from "@/hooks/utils/useKeyFilter";

import { PLAY_SHORTCUT } from "@/utils/keyboard";

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
