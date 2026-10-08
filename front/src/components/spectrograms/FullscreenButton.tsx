import Button from "@/components/Button";
import { EnterFullscreenIcon, ExitFullscreenIcon } from "@/components/icons";
import KeyboardKey from "@/components/KeyboardKey";
import Tooltip from "@/components/Tooltip";
import { FULLSCREEN_SHORTCUT } from "@/utils/keyboard";

export default function FullscreenButton({
  fullscreen,
  onToggle,
}: {
  fullscreen: boolean;
  onToggle?: () => void;
}) {
  return (
    <Tooltip
      tooltip={
        <div className="inline-flex gap-2 items-center">
          {fullscreen ? "Leave full page view" : "Full page view"}
          <div className="text-xs">
            <KeyboardKey code={FULLSCREEN_SHORTCUT} />
          </div>
        </div>
      }
      placement="bottom"
    >
      <Button
        variant={fullscreen ? "primary" : "secondary"}
        // Don't take focus: a focused button swallows the shortcut that leaves
        onMouseDown={(event) => event.preventDefault()}
        onClick={onToggle}
      >
        {fullscreen ? (
          <ExitFullscreenIcon className="w-5 h-5" />
        ) : (
          <EnterFullscreenIcon className="w-5 h-5" />
        )}
      </Button>
    </Tooltip>
  );
}
