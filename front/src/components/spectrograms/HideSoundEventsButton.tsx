import Button from "@/components/Button";
import { TagIcon } from "@/components/icons";
import KeyboardKey from "@/components/KeyboardKey";
import Tooltip from "@/components/Tooltip";
import { DISABLE_SPECTROGRAM_SHORTCUT, getSpecialKeyLabel } from "@/utils/keyboard";

/**
 * Hides the sound event annotations (and their tags) on the spectrogram. The
 * Shift + H shortcut itself is handled by `SpectrogramTags`.
 */
export default function HideSoundEventsButton({
  withSoundEvent,
  onWithSoundEventChange,
}: {
  withSoundEvent: boolean;
  onWithSoundEventChange?: () => void;
}) {
  return (
    <Tooltip
      portal={true}
      tooltip={
        <div className="inline-flex gap-2 items-center">
          {withSoundEvent ? "Hide sound events" : "Show sound events"}
          <span className="inline-flex gap-1">
            <KeyboardKey code={getSpecialKeyLabel("Shift")} />
            <KeyboardKey code={DISABLE_SPECTROGRAM_SHORTCUT.toUpperCase()} />
          </span>
        </div>
      }
      placement="bottom"
    >
      <Button
        variant={!withSoundEvent ? "primary" : "secondary"}
        pressed={!withSoundEvent}
        onClick={onWithSoundEventChange}
        aria-label={withSoundEvent ? "Hide sound events" : "Show sound events"}
      >
        <TagIcon className="w-5 h-5" />
      </Button>
    </Tooltip>
  );
}
