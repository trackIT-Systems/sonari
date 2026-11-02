import { Combobox, ComboboxButton, ComboboxOption, ComboboxOptions } from "@headlessui/react";
import { ChevronUpDownIcon } from "@heroicons/react/20/solid";
import { forwardRef, useContext, useEffect, useState } from "react";

import { Input } from "@/components/inputs/index";
import KeyboardKey from "@/components/KeyboardKey";
import Tag from "@/components/tags/Tag";
import TagScopeContext from "@/components/tags/TagScopeContext";
import useTags from "@/hooks/api/useTags";
import {
  tagScopeLabel,
  useProjectTagScope,
  useTagShortcuts,
} from "@/hooks/api/useTagManagement";

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

function TagScopeToggle({
  label,
  showAll,
  onToggle,
}: {
  label: string;
  showAll: boolean;
  onToggle: () => void;
}) {
  return (
    <ComboBoxSection>
      <div className="flex items-center justify-between gap-2 py-1.5 px-4 text-xs text-stone-500 dark:text-stone-400">
        <span>
          {showAll ? (
            "Showing all tags"
          ) : (
            <>
              Showing <span className="font-semibold">{label}</span> and
              general tags
            </>
          )}
        </span>
        <button
          type="button"
          className="shrink-0 font-medium text-emerald-600 hover:underline dark:text-emerald-400"
          // Keep focus in the input so the dropdown stays open.
          onMouseDown={(event) => event.preventDefault()}
          onClick={onToggle}
        >
          {showAll ? `Only ${label}` : "Show all tags"}
        </button>
      </div>
    </ComboBoxSection>
  );
}

/**
 * The shortcut digit of a key press: a plain digit while the search is
 * still empty, or Alt+digit at any time. `event.code` is used because
 * Alt+digit types other characters on macOS.
 */
export function shortcutDigit(
  event: Pick<
    KeyboardEvent<HTMLInputElement>,
    "code" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey"
  >,
  query: string,
): string | null {
  if (event.ctrlKey || event.metaKey || event.shiftKey) return null;
  const digit = /^(?:Digit|Numpad)(\d)$/.exec(event.code)?.[1];
  if (digit == null) return null;
  return event.altKey || query === "" ? digit : null;
}

function ShortcutHint({ shortcuts }: { shortcuts: TagType[] }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-stone-500 dark:text-stone-400">
      {shortcuts.map((tag) => (
        <span key={tag.shortcut} className="inline-flex items-center gap-0.5">
          <KeyboardKey code={tag.shortcut!} />
          {tag.value}
        </span>
      ))}
    </div>
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
  excludeTags?: TagType[];
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
      excludeTags = [],
      ...props
    },
    ref,
  ) {
    const [query, setQuery] = useState("");
    const [showAll, setShowAll] = useState(false);

    const annotationProjectId = useContext(TagScopeContext);
    const scope = useProjectTagScope(annotationProjectId);
    const scopeLabel = tagScopeLabel(scope.data);

    const tags = useTags({
      filter: initialFilter,
      annotationProjectId,
      scoped: !showAll,
    });
    const shortcuts = useTagShortcuts();

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

    // Filter out excluded tags
    const isExcluded = (tag: TagType) =>
      excludeTags.some(excluded => excluded.key === tag.key && excluded.value === tag.value);
    const filteredTags = tags.items.filter((tag) => !isExcluded(tag));
    const shortcutTags = (shortcuts.data ?? []).filter((tag) => !isExcluded(tag));

    return (
      <div className="relative">
        <Combobox
          onChange={(tag: TagType | null) => {
            if (tag != null) {
              onSelect?.(tag);
            }
          }}
        >
          <div className="relative w-full text-left cursor-default">
            <Combobox.Input
              as={Input}
              ref={ref}
              autoFocus={autoFocus}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                const digit = shortcutDigit(event, query);
                const shortcutTag = shortcutTags.find((tag) => tag.shortcut === digit);
                if (shortcutTag != null) {
                  event.preventDefault();
                  onSelect?.(shortcutTag);
                  return;
                }
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
          {query === "" && shortcutTags.length > 0 && (
            <ShortcutHint shortcuts={shortcutTags} />
          )}
          <ComboboxOptions className="absolute top-full mt-2 z-50 overflow-y-auto py-1 max-h-60 w-full text-base rounded-md divide-y ring-1 ring-opacity-5 shadow-lg sm:text-sm focus:outline-none divide-stone-200 bg-stone-50 ring-stone-300 dark:divide-stone-600 dark:bg-stone-700 dark:ring-stone-600 transition duration-200 ease-out data-[closed]:scale-95 data-[closed]:opacity-0 data-[enter]:duration-200 data-[leave]:duration-150 data-[enter]:ease-out data-[leave]:ease-in">
            {filteredTags.length === 0 ? (
              <NoTagsFound />
            ) : (
              <ComboBoxSection>
                {filteredTags.map((tag) => (
                  <ComboboxOption
                    key={`${tag.key}:${tag.value}`}
                    className={({ focus }) =>
                      `cursor-default py-2 pl-4 pr-2 ${focus ? "bg-stone-200 dark:bg-stone-600" : ""
                      }`
                    }
                    value={tag}
                  >
                    <span className="flex items-center gap-2">
                      <Tag
                        disabled
                        className="pointer-events-none"
                        tag={tag}
                        count={null}
                      />
                      {tag.shortcut && <KeyboardKey code={tag.shortcut} />}
                    </span>
                  </ComboboxOption>
                ))}
              </ComboBoxSection>
            )}
            {scopeLabel != null && (
              <TagScopeToggle
                label={scopeLabel}
                showAll={showAll}
                onToggle={() => setShowAll((value) => !value)}
              />
            )}
            {canCreate && <CreateNewTag tag={{ key, value }} />}
          </ComboboxOptions>
        </Combobox>
      </div>
    );
  },
);
