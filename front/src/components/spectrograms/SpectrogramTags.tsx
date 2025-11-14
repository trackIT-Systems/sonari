// Purpose: React component for displaying tags on the spectrogram.
import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import classNames from "classnames";
import { type HTMLProps, type ReactNode } from "react";
import { useMemo } from "react";

import { CloseIcon, TagIcon } from "@/components/icons";
import TagSearchBar from "@/components/tags/TagSearchBar";
import { getTagKey, getTagColor } from "../tags/Tag";

import type { TagFilter } from "@/api/tags";
import type { TagElement, TagGroup } from "@/utils/tags";
import type { Tag as TagType } from "@/types";
import { ABORT_SHORTCUT, ACCEPT_SHORTCUT, DISABLE_SPECTROGRAM_SHORTCUT } from "@/utils/keyboard";
import { useKeyPressEvent } from "react-use";
import useKeyFilter from "@/hooks/utils/useKeyFilter";

function TagBarPopover({
  onClose,
  onAdd,
  onCreate,
  filter,
  ...props
}: {
  onClose?: () => void;
  onAdd?: (tag: TagType) => void;
  onCreate?: (tag: TagType) => void;
  filter?: TagFilter;
} & Omit<HTMLProps<HTMLInputElement>, "value" | "onChange" | "onBlur" | "onSelect">) {
  return (
    <TagSearchBar
      onSelect={(tag) => {
        if (tag != null) {
          onAdd?.(tag);
          onClose?.();
        }
      }}
      onCreate={onCreate}
      autoFocus={true}
      onKeyDown={(e) => {
        if (e.key === ABORT_SHORTCUT) {
          onClose?.();
        } else if (e.key === ACCEPT_SHORTCUT) {
          onClose?.();
        }
      }}
      initialFilter={filter}
      {...props}
    />
  );
}

function SpectrogramTag({
  tag,
  onClick,
  disabled = false,
}: TagElement & { disabled?: boolean }) {
  const color = getTagColor(getTagKey(tag));
  const className = useMemo(() => {
    return `bg-${color.color}-500`;
  }, [color]);

  return (
    <span className="flex flex-row gap-1 -my-2 items-center px-2 rounded-full transition-all group bg-stone-200/0 dark:bg-stone-800/0 hover:bg-stone-200 hover:dark:bg-stone-800">
      <span
        className={`inline-block my-2 w-2 h-2 rounded-full ${className} ring-1 ring-stone-900 opacity-100`}
      ></span>
      <button
        type="button"
        className="hidden flex-row gap-1 items-center opacity-0 transition-all group-hover:flex group-hover:opacity-100 hover:text-red-500 text-stone-800 dark:text-stone-400"
        onClick={onClick}
      >
        <span className="hidden text-xs font-thin whitespace-nowrap opacity-0 transition-all group-hover:inline-block group-hover:opacity-100">
          {tag.key}
        </span>
        <span className="hidden text-sm font-medium italic whitespace-nowrap opacity-0 transition-all group-hover:inline-block group-hover:opacity-100">
          {tag.value}
        </span>
        {!disabled && <CloseIcon className="inline-block w-3 h-3 stroke-2" />}
      </button>
    </span>
  );
}

function AddTagButton({
  filter,
  onCreate,
  onAdd,
}: {
  filter?: TagFilter;
  onCreate?: (tag: TagType) => void;
  onAdd?: (tag: TagType) => void;
}) {
  return (
    <Popover as="div" className="relative">
      <PopoverButton as="div" className="whitespace-nowrap rounded hover:text-emerald-500 focus:ring-4 focus:outline-none group focus:ring-emerald-500/50 z-20">
        +<TagIcon className="inline-block ml-1 w-4 h-4 stroke-2" />
        <span className="hidden absolute ml-1 whitespace-nowrap opacity-0 transition-all duration-200 group-hover:inline-block group-hover:opacity-100">
          Add tag
        </span>
      </PopoverButton>
      <PopoverPanel 
        className="absolute top-full mt-1 w-52 z-20 transition duration-200 ease-out data-[closed]:scale-95 data-[closed]:opacity-0 data-[enter]:duration-200 data-[leave]:duration-150 data-[enter]:ease-out data-[leave]:ease-in" 
        focus 
        unmount
      >
        {({ close }) => (
          <TagBarPopover
            filter={filter}
            onClose={close}
            onCreate={(tag) => {
              onCreate?.(tag);
              close();
            }}
            onAdd={(tag) => {
              onAdd?.(tag);
              close();
            }}
          />
        )}
      </PopoverPanel>
    </Popover>
  );
}

export function TagGroup({
  group,
  filter,
  disabled = false,
}: {
  group: TagGroup;
  filter?: TagFilter;
  disabled?: boolean;
}) {
  const { x, y } = group.position;
  return (
    <div
      className={classNames(
        {
          "pointer-events-none": !group.active,
        },
        "h-5 flex flex-col absolute px-2 text-stone-300 hover:z-50 z-40",
      )}
      style={{
        left: x,
        top: y,
      }}
    >
      <div className="-ms-2 relative flex flex-col right-0 hover:gap-2">
        {group.tags.map((tagElement) => (
          <SpectrogramTag
            key={`${tagElement.tag.key}:${tagElement.tag.value}`}
            {...tagElement}
            disabled={disabled}
          />
        ))}
      </div>
      {!disabled && (
        <AddTagButton
          filter={filter}
          onCreate={(tag) => {
            group.onAdd?.(tag);
          }}
          onAdd={(tag) => {
            group.onAdd?.(tag);
          }}
        />
      )}
    </div>
  );
}

export default function SpectrogramTags({
  tags,
  children,
  disabled = false,
  withSoundEvent = true,
  onWithSoundEventChange,
}: {
  tags: TagGroup[];
  children: ReactNode;
  disabled?: boolean;
  withSoundEvent?: boolean;
  onWithSoundEventChange?: () => void;
}) {

  useKeyPressEvent(useKeyFilter({ key: DISABLE_SPECTROGRAM_SHORTCUT.toUpperCase()}), (event: KeyboardEvent) => {
    if (!event.shiftKey || !onWithSoundEventChange) {
      return;
    }
    onWithSoundEventChange();
  });

  if (!withSoundEvent) {
    return (<div className="relative w-full h-full rounded">
      {children}
    </div>)
  }
  return (
    <div className="relative w-full h-full rounded">
      {children}
      {tags.map((group) => (
        <TagGroup
          key={group.annotation.id}
          group={group}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
