import { ReactNode, useRef } from "react";

import Button from "@/components/Button";
import {
  AddIcon,
  BoundingBoxIcon,
  DeleteIcon,
  EditIcon,
  SelectIcon,
  TimeIntervalIcon,
  ArrowTrendingDownIcon,
} from "@/components/icons";
import KeyboardKey from "@/components/KeyboardKey";
import Select from "@/components/inputs/Select";
import Tooltip from "@/components/Tooltip";
import { CREATE_SOUND_EVENT_SHORTCUT, DELETE_SOUND_EVENT_SHORTCUT, SELECT_SOUND_EVENT_SHORTCUT, GEOMETRY_TYPE_SHORTCUT, getSpecialKeyLabel } from "@/utils/keyboard";
import useKeyFilter from "@/hooks/utils/useKeyFilter";
import { useKeyPressEvent } from "react-use";

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

export default function AnnotationControls({
  isDrawing,
  isDeleting,
  isSelecting,
  isEditing,
  geometryType,
  disabled = false,
  onDraw,
  onDelete,
  onSelect,
  onSelectGeometryType,
}: {
  isDrawing: boolean;
  isDeleting: boolean;
  isSelecting: boolean;
  isEditing: boolean;
  geometryType: GeometryType;
  disabled?: boolean;
  onDraw?: () => void;
  onDelete?: () => void;
  onSelect?: () => void;
  onSelectGeometryType?: (type: GeometryType) => void;
}) {

  const geometrySelectRef = useRef<HTMLButtonElement>(null);

  useKeyPressEvent(useKeyFilter({ key: GEOMETRY_TYPE_SHORTCUT }), () => {
    geometrySelectRef.current?.click();
  });

  if (disabled)
    return (
      <div className="flex space-x-2">
        <Tooltip
          tooltip={
            <div className="inline-flex gap-1">
              Select
              <span className="text-xs">
                <KeyboardKey code={SELECT_SOUND_EVENT_SHORTCUT} />
              </span>
            </div>
          }
          placement="bottom"

        >
          <Button
            variant={isSelecting ? "primary" : "secondary"}
            onClick={onSelect}
          >
            <SelectIcon className="w-5 h-5" />
          </Button>
        </Tooltip>
      </div>
    );

  return (
    <div className="flex space-x-2">
      <Tooltip
        tooltip={
          <div className="inline-flex gap-1">
            Create
            <span className="text-xs">
              <KeyboardKey code={CREATE_SOUND_EVENT_SHORTCUT} />
            </span>
          </div>
        }
        placement="bottom"
      >
        <Button variant={isDrawing ? "primary" : "secondary"} onClick={onDraw}>
          <AddIcon className="w-5 h-5" />
        </Button>
      </Tooltip>


      {!isEditing ? (
        <Tooltip
          tooltip={
            <div className="inline-flex gap-1">
              Select
              <span className="text-xs">
                <KeyboardKey code={SELECT_SOUND_EVENT_SHORTCUT} />
              </span>
            </div>
          }
          placement="bottom"
        >
          <Button
            variant={isSelecting ? "primary" : "secondary"}
            onClick={onSelect}
          >
            <SelectIcon className="w-5 h-5" />
          </Button>
        </Tooltip>
      ) : (
        <Button variant="warning" onClick={onSelect}>
          <EditIcon className="w-5 h-5" />
        </Button>
      )}
      <Tooltip
        tooltip={
          <div className="inline-flex gap-1">
            Delete
            <span className="text-xs">
              <KeyboardKey code={DELETE_SOUND_EVENT_SHORTCUT} />
            </span>
          </div>
        }
        placement="bottom"
      >
        <Button
          variant={isDeleting ? "danger" : "secondary"}
          onClick={onDelete}
        >
          <DeleteIcon className="w-5 h-5" />
        </Button>
      </Tooltip>
      <Select
        placement="bottom"
        options={Object.values(geometryTypes)}
        selected={geometryTypes[geometryType]}
        onChange={(type) => onSelectGeometryType?.(type as GeometryType)}
        buttonRef={geometrySelectRef as React.RefObject<HTMLButtonElement>}
      />
    </div>
  );
}
