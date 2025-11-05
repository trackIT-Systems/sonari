import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";

import Button from "@/components/Button";
import { AddIcon } from "@/components/icons";
import TagSearchBar from "@/components/tags/TagSearchBar";
import { ABORT_SHORTCUT, ACCEPT_SHORTCUT } from "@/utils/keyboard";

import type { TagFilter } from "@/api/tags";
import type { Tag as TagType } from "@/types";
import type { HTMLProps } from "react";

function TagBarPopover({
  onClose,
  filter,
  ...props
}: {
  onClose?: () => void;
  filter?: TagFilter;
} & Omit<HTMLProps<HTMLInputElement>, "value" | "onChange" | "onBlur">) {
  return (
    <TagSearchBar
      // @ts-ignore
      onSelect={(tag) => {
      }}
      onCreate={(tag) => {
        onClose?.(); // Close the popover after tag creation
      }}
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

export default function AddTagButton({
  onAdd,
  onCreate,
  text = "add",
  variant = "secondary",
  filter,
  ...props
}: {
  text?: string;
  filter?: TagFilter;
  onAdd?: (tag: TagType) => void;
  onCreate?: (tag: TagType) => void;
  variant?: "primary" | "secondary" | "danger";
} & Omit<HTMLProps<HTMLInputElement>, "value" | "onChange" | "onBlur">) {
  return (
    <Popover as="div" className="relative inline-block text-left">
      <PopoverButton as="div">
        <Button mode="text" variant={variant} padding="py-1">
          <AddIcon className="inline-block w-5 h-5 align-middle" />
          {text}
        </Button>
      </PopoverButton>
      <PopoverPanel 
        className="absolute top-full mt-1 w-72 z-20 transition duration-200 ease-out data-[closed]:scale-95 data-[closed]:opacity-0 data-[enter]:duration-200 data-[leave]:duration-150 data-[enter]:ease-out data-[leave]:ease-in" 
        focus 
        unmount
      >
        {({ close }) => (
          <TagBarPopover
            onClose={close}
            filter={filter}
            {...props}
          />
        )}
      </PopoverPanel>
    </Popover>
  );
}
