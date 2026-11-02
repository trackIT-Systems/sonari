import Button from "@/components/Button";
import { ZoomInIcon, ZoomOutIcon } from "@/components/icons";
import KeyboardKey from "@/components/KeyboardKey";
import Tooltip from "@/components/Tooltip";
import { ZOOM_IN_SHORTCUT, ZOOM_OUT_SHORTCUT } from "@/utils/keyboard";

/**
 * Step zoom in and out of a spectrogram, keeping the centre of the view and the
 * ratio between the time and frequency axes.
 */
export default function SpectrogramZoomControls({
  withShortcutHints = true,
  onZoomIn,
  onZoomOut,
}: {
  /** Off for views the zoom keys do not reach, so the tooltips stay honest */
  withShortcutHints?: boolean;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
}) {
  return (
    <div className="flex space-x-2">
      <Tooltip
        tooltip={
          <div className="inline-flex gap-2 items-center">
            Zoom in
            {withShortcutHints && (
              <div className="text-xs">
                <KeyboardKey code={ZOOM_IN_SHORTCUT} />
              </div>
            )}
          </div>
        }
        placement="bottom"
      >
        <Button variant="secondary" onClick={onZoomIn}>
          <ZoomInIcon className="w-5 h-5" />
        </Button>
      </Tooltip>
      <Tooltip
        tooltip={
          <div className="inline-flex gap-2 items-center">
            Zoom out
            {withShortcutHints && (
              <div className="text-xs">
                <KeyboardKey code={ZOOM_OUT_SHORTCUT} />
              </div>
            )}
          </div>
        }
        placement="bottom"
      >
        <Button variant="secondary" onClick={onZoomOut}>
          <ZoomOutIcon className="w-5 h-5" />
        </Button>
      </Tooltip>
    </div>
  );
}
