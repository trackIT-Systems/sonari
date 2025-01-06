import Button from "@/components/Button";
import { DisableIcon } from "@/components/icons";
import Tooltip from "@/components/Tooltip";
import KeyboardKey from "../KeyboardKey";
import { DISABLE_SPECTROGRAM_SHORTCUT } from "@/utils/keyboard";
import { useKeyPressEvent } from "react-use";
import useKeyFilter from "@/hooks/utils/useKeyFilter";

export default function DisableSpectrogramButton({
  withSpectrogram,
  onWithSpectrogramChange,
}: {
  withSpectrogram: boolean;
  onWithSpectrogramChange?: () => void;
}) {

  useKeyPressEvent(useKeyFilter({ key: DISABLE_SPECTROGRAM_SHORTCUT }), onWithSpectrogramChange);

  return (
    <div className="flex space-x-2">
      <Tooltip
        tooltip={
          <div className="inline-flex gap-2 items-center">
            Disable spectrogram
            <KeyboardKey code={DISABLE_SPECTROGRAM_SHORTCUT} />
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
