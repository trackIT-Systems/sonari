import { ReactNode, useRef } from "react";

import Button from "@/components/Button";
import {
  ArrowTrendingDownIcon,
} from "@/components/icons";
import KeyboardKey from "@/components/KeyboardKey";
import Tooltip from "@/components/Tooltip";
import { MEASURE_SHORTCUT, getSpecialKeyLabel } from "@/utils/keyboard";

export default function MeasurementControls({
  isMeasuring,
  onMeasure,
}: {
  isMeasuring: boolean;
  onMeasure?: () => void;
}) {
  return (
    <div className="flex space-x-2">
      <Tooltip
        tooltip={
          <div className="inline-flex gap-1">
            Measure
            <span className="text-xs">
              <KeyboardKey code={`${getSpecialKeyLabel("Shift")}`} /><KeyboardKey code={MEASURE_SHORTCUT.toLowerCase()} />
            </span>
          </div>
        }
        placement="bottom"
      >
        <Button variant={isMeasuring ? "primary" : "secondary"} onClick={onMeasure}>
          <ArrowTrendingDownIcon className="w-5 h-5" />
        </Button>
      </Tooltip>
    </div>
  );
}
