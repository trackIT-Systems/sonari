import Button from "@/components/Button";
import { BackIcon, DragIcon, SearchIcon, ZoomInIcon, ZoomOutIcon } from "@/components/icons";
import Tooltip from "@/components/Tooltip";
import KeyboardKey from "@/components/KeyboardKey";

export default function SpectrogramControls({
  canDrag,
  canZoom,
  onDrag,
  onZoom,
  onReset,
  onZoomIn,
  onZoomOut,
}: {
  canDrag: boolean;
  canZoom: boolean;
  onReset?: () => void;
  onDrag?: () => void;
  onZoom?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
}) {
  return (
    <div className="flex space-x-2">
      <Tooltip
        tooltip={
          <div className="inline-flex gap-2 items-center">
            Drag spectrogram
            <div className="text-xs">
              <KeyboardKey code="x" />
            </div>
          </div>
        }
        placement="bottom"
      >
        <Button variant={canDrag ? "primary" : "secondary"} onClick={onDrag}>
          <DragIcon className="w-5 h-5" />
        </Button>
      </Tooltip>
      <Tooltip
        tooltip={
          <div className="inline-flex gap-2 items-center">
            Zoom to selection
            <div className="text-xs">
              <KeyboardKey code="z" />
            </div>
          </div>
        }
        placement="bottom"
      >
        <Button variant={canZoom ? "primary" : "secondary"} onClick={onZoom}>
          <SearchIcon className="w-5 h-5" />
        </Button>
      </Tooltip>
      <Tooltip
        tooltip={
          <div className="inline-flex gap-2 items-center">
            Zoom in
            <div className="text-xs">
              <KeyboardKey code="+" />
            </div>
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
            <div className="text-xs">
              <KeyboardKey code="-" />
            </div>
          </div>
        }
        placement="bottom"
      >
        <Button variant="secondary" onClick={onZoomOut}>
          <ZoomOutIcon className="w-5 h-5" />
        </Button>
      </Tooltip>
      <Tooltip tooltip="Reset zoom" placement="bottom">
        <Button variant="secondary" onClick={onReset}>
          <BackIcon className="w-5 h-5" />
        </Button>
      </Tooltip>
    </div>
  );
}
