import { Combobox, ComboboxButton, ComboboxOption, ComboboxOptions } from "@headlessui/react";
import { ChevronUpDownIcon } from "@heroicons/react/20/solid";
import { forwardRef, useEffect, useState } from "react";

import { Input } from "@/components/inputs/index";
import KeyboardKey from "@/components/KeyboardKey";
import Tag from "@/components/tags/Tag";
import useTags from "@/hooks/api/useTags";

import type { TagCreate, TagFilter } from "@/api/tags";
import type { Tag as TagType } from "@/types";
import type { InputHTMLAttributes, KeyboardEvent } from "react";
import { ACCEPT_SHORTCUT, getSpecialKeyLabel } from "@/utils/keyboard";

function ComboBoxSection({ children }: { children: React.ReactNode }) {
  return (
    <div className="py-1" role="none">
      {children}
    </div>
  );
}

function CreateNewTag({ tag: { key, value } }: { tag: TagCreate }) {
  if (key == null || value == null) {
    return (
      <ComboBoxSection>
        <div className="relative py-2 px-4 cursor-default select-none">
          To create a new tag, type the tag in the format{" "}
          <code className="text-emerald-500">key:value</code> and press{" "}
          <KeyboardKey code={`${getSpecialKeyLabel("Shift")}`} /><KeyboardKey code={`${getSpecialKeyLabel(ACCEPT_SHORTCUT)}`} />
        </div>
      </ComboBoxSection>
    );
  }

  return (
    <ComboBoxSection>
      <div className="relative py-2 px-4 cursor-default select-none">
        Create the tag{" "}
        <Tag disabled tag={{ key, value }} color="blue" count={null} /> by pressing{" "}
        <KeyboardKey code={`${getSpecialKeyLabel("Shift")}`} /><KeyboardKey code={`${getSpecialKeyLabel(ACCEPT_SHORTCUT)}`} />
      </div>
    </ComboBoxSection>
  );
}

function NoTagsFound() {
  return (
    <ComboBoxSection>
      <div className="relative py-2 px-4 cursor-default select-none">
        No tags found.{" "}
      </div>
    </ComboBoxSection>
  );
}

type TagSearchBarProps = {
  onSelect?: (tag: TagType) => void;
  onBlur?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  onCreate?: (tag: TagType) => void;
  initialFilter?: TagFilter;
  canCreate?: boolean;
} & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "onSelect" | "onChange" | "onKeyDown" | "onBlur"
>;

const emptyFilter = {};

export default forwardRef<HTMLInputElement, TagSearchBarProps>(
  function TagSearchBar(
    {
      onSelect,
      initialFilter = emptyFilter,
      onBlur,
      onKeyDown,
      onCreate,
      autoFocus = true,
      canCreate = true,
      ...props
    },
    ref,
  ) {
    const [query, setQuery] = useState("");

    const tags = useTags({ filter: initialFilter });

    const key = query.split(":")[0];
    const value = query.split(":")[1];

    useEffect(() => {
      let key = query.split(":")[0];
      let value = query.split(":")[1];

      if (value == null || key == null) {
        tags.filter.set("search", query);
        tags.filter.clear("key");
        tags.filter.clear("value");
      } else {
        tags.filter.clear("search");
        tags.filter.set("key", key);
        tags.filter.set("value", { has: value });
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query]);

    return (
      <Combobox
        onChange={(tag: TagType) => {
          onSelect?.(tag);
        }}
      >
        <div className="relative w-full text-left cursor-default">
          <Combobox.Input
            as={Input}
            ref={ref}
            autoFocus={autoFocus}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === ACCEPT_SHORTCUT && event.shiftKey && canCreate) {
                event.preventDefault();
                if (key && value) {
                  tags.create.mutateAsync({ key, value })
                    .then((tag) => {
                      setQuery(""); // Clear the input field
                      onCreate?.(tag);
                    })
                    .catch((error) => {
                      console.error("Tag creation failed:", error);
                    });
                } else {
                  console.log("Cannot create tag: missing key or value", { key, value });
                }
              }
              onKeyDown?.(event);
            }}
            {...props}
          />
          <ComboboxButton className="flex absolute inset-y-0 right-0 items-center pr-2">
            <ChevronUpDownIcon className="w-5 h-5" aria-hidden="true" />
          </ComboboxButton>
        </div>
        <ComboboxOptions className="absolute top-full mt-2 z-10 overflow-y-auto py-1 max-w-sm text-base rounded-md divide-y ring-1 ring-opacity-5 shadow-lg sm:text-sm focus:outline-none divide-stone-200 bg-stone-50 ring-stone-300 dark:divide-stone-600 dark:bg-stone-700 dark:ring-stone-600 transition duration-200 ease-out data-[closed]:scale-95 data-[closed]:opacity-0 data-[enter]:duration-200 data-[leave]:duration-150 data-[enter]:ease-out data-[leave]:ease-in">
          {tags.items.length === 0 ? (
            <NoTagsFound />
          ) : (
            <ComboBoxSection>
              {tags.items.map((tag) => (
                <ComboboxOption
                  key={`${tag.key}:${tag.value}`}
                  className={({ focus }) =>
                    `cursor-default py-2 pl-4 pr-2 ${focus ? "bg-stone-200 dark:bg-stone-600" : ""
                    }`
                  }
                  value={tag}
                >
                  <Tag
                    disabled
                    className="pointer-events-none"
                    tag={tag}
                    count={null}
                  />
                </ComboboxOption>
              ))}
            </ComboBoxSection>
          )}
          {canCreate && <CreateNewTag tag={{ key, value }} />}
        </ComboboxOptions>
      </Combobox>
    );
  },
);
