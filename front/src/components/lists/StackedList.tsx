import { type Key, type ReactElement, useEffect, useCallback } from "react";
import useKeyFilter from "@/hooks/utils/useKeyFilter";
import { useKeyPressEvent } from "react-use";
import {
  LIST_ELEMENT_UP_SHORTCUT,
  SELECT_LIST_ELEMENT_SHORTCUT,
  LIST_ELEMENT_DOWN_SHORTCUT,
  SELECT_FST_ELEMENT_SHORTCUT,
  SELECT_SND_ELEMENT_SHORTCUT,
  SELECT_TRD_ELEMENT_SHORTCUT,
  SELECT_FRT_ELEMENT_SHORTCUT,
  SELECT_FTH_ELEMENT_SHORTCUT,
  SELECT_STH_ELEMENT_SHORTCUT,
  SELECT_SVNTH_ELEMENT_SHORTCUT,
  SELECT_ETH_ELEMENT_SHORTCUT,
  SELECT_NTH_ELEMENT_SHORTCUT,
} from "@/utils/keyboard";

type ElementWithKey = ReactElement & { key: Key | null };

export default function StackedList({
  items,
  onSelect,
  onHighlight,
  onFocusChange,
  selectedIndex = -1,
  handleNumberKeys = true,
}: {
  items: ElementWithKey[];
  onSelect?: (item: ElementWithKey) => void;
  onHighlight?: (item: ElementWithKey) => void;
  onFocusChange?: (index: number) => void;
  selectedIndex?: number;
  handleNumberKeys?: boolean;
}) {

  useKeyPressEvent(useKeyFilter({ key: LIST_ELEMENT_DOWN_SHORTCUT }), (event) => {
    event.preventDefault();
    if (selectedIndex > -1) {
      const newIndex = Math.min(items.length - 1, selectedIndex + 1);
      onFocusChange?.(newIndex);
      if (onHighlight && newIndex >= 0) {
        onHighlight(items[newIndex]);
      }
    }
  });


  useKeyPressEvent(useKeyFilter({ key: LIST_ELEMENT_UP_SHORTCUT }), (event) => {
    event.preventDefault();
    if (selectedIndex <= 0) {
      onFocusChange?.(-1);
    } else {
      const newIndex = selectedIndex - 1;
      onFocusChange?.(newIndex);
      if (onHighlight && newIndex >= 0) {
        onHighlight(items[newIndex]);
      }
    }
  });

  useKeyPressEvent(useKeyFilter({ key: SELECT_LIST_ELEMENT_SHORTCUT }), () => {
    if (selectedIndex >= 0 && selectedIndex < items.length && onSelect) {
      onSelect(items[selectedIndex]);
    }
  });

  const hndlNumberKeys = useCallback((event: KeyboardEvent) => {
    if (event.metaKey || event.shiftKey) {
      return
    }
    const index = parseInt(event.key) - 1;
    if (index < items.length && onSelect && onHighlight) {
      event.preventDefault();
      event.stopPropagation();
      onHighlight(items[index]);
      onSelect(items[index]);
    }
  }, [items, onSelect, onHighlight])

  useKeyPressEvent(useKeyFilter({ key: SELECT_FST_ELEMENT_SHORTCUT }), hndlNumberKeys);
  useKeyPressEvent(useKeyFilter({ key: SELECT_SND_ELEMENT_SHORTCUT }), hndlNumberKeys);
  useKeyPressEvent(useKeyFilter({ key: SELECT_TRD_ELEMENT_SHORTCUT }), hndlNumberKeys);
  useKeyPressEvent(useKeyFilter({ key: SELECT_FRT_ELEMENT_SHORTCUT }), hndlNumberKeys);
  useKeyPressEvent(useKeyFilter({ key: SELECT_FTH_ELEMENT_SHORTCUT }), hndlNumberKeys);
  useKeyPressEvent(useKeyFilter({ key: SELECT_STH_ELEMENT_SHORTCUT }), hndlNumberKeys);
  useKeyPressEvent(useKeyFilter({ key: SELECT_SVNTH_ELEMENT_SHORTCUT }), hndlNumberKeys);
  useKeyPressEvent(useKeyFilter({ key: SELECT_ETH_ELEMENT_SHORTCUT }), hndlNumberKeys);
  useKeyPressEvent(useKeyFilter({ key: SELECT_NTH_ELEMENT_SHORTCUT }), hndlNumberKeys);


  return (
    <ul
      role="list"
      className="w-full divide-y divide-stone-300 dark:divide-stone-700"
      tabIndex={0}
    > 
      {items.map((item, index) => (
        <li
          className={`flex justify-between gap-x-6 py-5 ${index === selectedIndex ? 'bg-stone-100 dark:bg-stone-800' : ''
            }`}
          key={item.key}
        >
          <div className="flex gap-x-4 w-full">
            <div className="leading-7 text-emerald-500">
              {index + 1}
            </div>
            {item}
          </div>
        </li>
      ))}
    </ul>
  );
}