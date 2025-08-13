import { Fragment, useMemo, useRef, useState } from "react";
import { Listbox, ListboxButton, ListboxOptions, ListboxOption, Transition } from "@headlessui/react";
import classNames from "classnames";

import Button from "@/components/Button";
import { ExpandIcon, DeleteIcon } from "@/components/icons";
import type { Filter } from "@/hooks/utils/useFilter";
import useFilterPresets from "@/hooks/utils/useFilterPresets";

export default function FilterPresets<T extends Object>({
  storageKey,
  filter,
  className,
  recentLimit = 3,
}: {
  storageKey: string;
  filter: Filter<T>;
  className?: string;
  recentLimit?: number;
}) {
  const { recentList, savedList, savePreset, deletePreset, applyPreset } = useFilterPresets<T>({
    storageKey,
    filter,
  });

  const [name, setName] = useState("");
  const recent = useMemo(() => recentList.slice(0, recentLimit), [recentList, recentLimit]);

  return (
    <div className={classNames("inline-flex items-center gap-2", className)}>
      <div className="relative">
        <Listbox value={null} onChange={() => {}}>
          <ListboxButton className="flex flex-row items-center px-2 py-1 rounded-md border border-stone-300 bg-stone-100 dark:border-stone-600 dark:bg-stone-700 text-sm">
            Presets
            <ExpandIcon className="w-4 h-4 ml-1" />
          </ListboxButton>
          <Transition as={Fragment} enter="transition ease-out duration-100" enterFrom="transform opacity-0 scale-95" enterTo="transform opacity-100 scale-100" leave="transition ease-in duration-75" leaveFrom="transform opacity-100 scale-100" leaveTo="transform opacity-0 scale-95">
            <ListboxOptions className="absolute right-0 mt-1 w-96 divide-y divide-stone-100 rounded-md bg-stone-50 dark:bg-stone-700 border border-stone-200 dark:border-stone-500 shadow-md dark:shadow-stone-800 ring-1 ring-stone-900 ring-opacity-5 focus:outline-none z-50">
              <div className="p-3">
                <div className="text-xs uppercase text-stone-500 mb-2">Recent</div>
                {recent.length === 0 ? (
                  <div className="text-stone-500 text-sm">No recent filters</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {recent.map((r, idx) => (
                      <Button key={idx} mode="outline" variant="info" onClick={() => applyPreset(r.filter)}>
                        Apply recent #{idx + 1}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
              <div className="p-3">
                <div className="text-xs uppercase text-stone-500 mb-2">Saved</div>
                <div className="flex flex-col gap-2">
                  {savedList.length === 0 ? (
                    <div className="text-stone-500 text-sm">No saved presets</div>
                  ) : (
                    savedList.map((p) => (
                      <div key={p.name} className="flex items-center justify-between gap-2">
                        <Button mode="outline" variant="primary" onClick={() => applyPreset(p.filter)}>
                          {p.name}
                        </Button>
                        <Button mode="text" variant="danger" onClick={() => deletePreset(p.name)}>
                          <DeleteIcon className="w-4 h-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="p-3">
                <div className="text-xs uppercase text-stone-500 mb-2">Save current</div>
                <div className="flex gap-2">
                  <input
                    className="flex-1 px-2 py-1 rounded border border-stone-300 bg-stone-50 dark:bg-stone-800 dark:border-stone-600 text-sm"
                    placeholder="Preset name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <Button mode="filled" variant="success" onClick={() => name && (savePreset(name), setName(""))}>
                    Save
                  </Button>
                </div>
              </div>
            </ListboxOptions>
          </Transition>
        </Listbox>
      </div>
    </div>
  );
}

