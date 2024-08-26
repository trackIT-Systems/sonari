import Button from "@/components/Button";
import {DisableIcon} from "@/components/icons";
import Tooltip from "@/components/Tooltip";
import KeyboardKey from "@/components/KeyboardKey";

export default function DisableSpectrogramButton({
  withSpectrogram,
  onWithSpectrogramChange,
}: {
  withSpectrogram: boolean;
  onWithSpectrogramChange?: () => void;
}) {
  return (
    <div className="flex space-x-2">
      <Tooltip
        tooltip={
          <div className="inline-flex gap-2 items-center">
            Disable spectrogram
          </div>
        }
        placement="bottom"
      >
        <Button variant={!withSpectrogram ? "primary" : "secondary"} onClick={onWithSpectrogramChange}>
          <DisableIcon className="w-5 h-5" />
        </Button>
      </Tooltip>
    </div>
  );
}
