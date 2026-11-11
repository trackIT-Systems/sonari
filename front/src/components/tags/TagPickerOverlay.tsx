import classNames from "classnames";
import Fuse from "fuse.js";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import Button from "@/components/Button";
import TagComponent, { getTagKey } from "@/components/tags/Tag";

import type { Tag } from "@/types";

export type TagOption = { tag: Tag; count: number };

const ACCENTS = {
  amber: "decoration-amber-500",
  red: "decoration-red-500",
} as const;

/**
 * While an overlay is open it owns the keyboard: keys are caught in the
 * capture phase, before the annotate shortcuts (arrow keys move the
 * spectrogram, Enter and letters run actions), whether or not its search field
 * has focus. Typing still reaches the field: only the keydown is stopped.
 */
function useOverlayKeys(onKey: (event: KeyboardEvent) => boolean) {
  const onKeyRef = useRef(onKey);
  onKeyRef.current = onKey;
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (onKeyRef.current(event)) event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("keydown", listener, true);
    return () => window.removeEventListener("keydown", listener, true);
  }, []);
}

function Overlay({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/20"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-label={label}
        className="w-96 rounded-md border border-stone-200 bg-stone-50 p-4 shadow-md ring-1 ring-stone-900 ring-opacity-5 dark:border-stone-500 dark:bg-stone-700 dark:shadow-stone-800"
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Pick a tag from a list: type to filter, ↑ / ↓ to move, Enter to pick, Esc to
 * close; or click one.
 */
export default function TagPickerOverlay({
  title,
  options,
  onSelect,
  onClose,
  accent = "amber",
  empty = "No tags found",
}: {
  title: ReactNode;
  options: TagOption[];
  onSelect: (option: TagOption) => void;
  onClose: () => void;
  accent?: keyof typeof ACCENTS;
  empty?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const fuse = useMemo(
    () => new Fuse(options, { keys: ["tag.key", "tag.value"], threshold: 0.3 }),
    [options],
  );
  const filtered = useMemo(
    () => (query ? fuse.search(query).map((result) => result.item) : options),
    [query, fuse, options],
  );

  useEffect(() => setActive(0), [query, options]);
  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  useOverlayKeys((event) => {
    switch (event.key) {
      case "ArrowDown":
        setActive((index) => Math.min(filtered.length - 1, index + 1));
        return true;
      case "ArrowUp":
        setActive((index) => Math.max(0, index - 1));
        return true;
      case "Enter": {
        const option = filtered[active];
        if (option) onSelect(option);
        return true;
      }
      case "Escape":
        onClose();
        return true;
      default:
        // Typing goes to the search field, even if it lost focus
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) inputRef.current?.focus();
        return false;
    }
  });

  return (
    <Overlay label="Pick a tag" onClose={onClose}>
      <div
        className={classNames(
          "mb-2 text-stone-700 underline decoration-2 underline-offset-2 dark:text-stone-300",
          ACCENTS[accent],
        )}
      >
        {title}
      </div>
      <input
        ref={inputRef}
        type="search"
        aria-label="Search tags"
        placeholder="Search..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="w-full rounded-md border border-stone-300 bg-stone-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-stone-600 dark:bg-stone-800"
      />
      {filtered.length === 0 ? (
        <div className="mt-2 w-full text-center text-sm text-stone-500">{empty}</div>
      ) : (
        <ul ref={listRef} role="listbox" aria-label="Tags" className="mt-2 max-h-60 overflow-auto">
          {filtered.map((option, index) => (
            <li
              key={getTagKey(option.tag)}
              role="option"
              aria-selected={index === active}
              // Keep the focus in the search field
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => onSelect(option)}
              className={classNames(
                "cursor-default select-none rounded-md p-2",
                index === active && "bg-stone-200 text-emerald-600 dark:bg-stone-800 dark:text-emerald-500",
              )}
            >
              <TagComponent tag={option.tag} count={option.count} onClose={() => {}} />
            </li>
          ))}
        </ul>
      )}
    </Overlay>
  );
}

/** Confirm a destructive action: Enter confirms, Esc cancels. */
export function ConfirmOverlay({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: ReactNode;
  message: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useOverlayKeys((event) => {
    if (event.key === "Enter") {
      onConfirm();
      return true;
    }
    if (event.key === "Escape") {
      onCancel();
      return true;
    }
    return false;
  });

  return (
    <Overlay label="Confirm" onClose={onCancel}>
      <div className="mb-2 text-stone-700 underline decoration-red-500 decoration-2 underline-offset-2 dark:text-stone-300">
        {title}
      </div>
      <p className="mb-4 text-sm text-stone-600 dark:text-stone-300">{message}</p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel <span className="ml-1 font-mono text-xs">Esc</span>
        </Button>
        <Button variant="danger" onClick={onConfirm}>
          {confirmLabel} <span className="ml-1 font-mono text-xs">Enter</span>
        </Button>
      </div>
    </Overlay>
  );
}
