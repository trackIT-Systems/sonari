import { ReactNode, useRef } from "react";

import Button from "@/components/Button";
import {
  BoundingBoxIcon,
  TimeIntervalIcon,
  ArrowTrendingDownIcon,
} from "@/components/icons";
import KeyboardKey from "@/components/KeyboardKey";
import Tooltip from "@/components/Tooltip";
import { MEASURE_SHORTCUT, getSpecialKeyLabel } from "@/utils/keyboard";

import type { GeometryType } from "@/types";

type Node = {
  id: string;
  label: ReactNode;
  value: string;
};

// @ts-ignore
const geometryTypes: Record<GeometryType, Node> = {
  TimeInterval: {
    id: "TimeInterval",
    label: <TimeIntervalIcon className="w-5 h-5" />,
    value: "TimeInterval",
  },
  BoundingBox: {
    id: "BoundingBox",
    label: <BoundingBoxIcon className="w-5 h-5" />,
    value: "BoundingBox",
  },
};

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
