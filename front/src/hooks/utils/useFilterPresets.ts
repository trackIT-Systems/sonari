import { useCallback, useEffect, useMemo, useState } from "react";
import type { Filter } from "@/hooks/utils/useFilter";

type SavedPreset<T> = {
  name: string;
  filter: T;
  savedAt: number;
};

type RecentPreset<T> = {
  filter: T;
  savedAt: number;
};

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// Helper function to remove annotation_project from filter objects
function stripAnnotationProject<T extends Object>(filter: T): T {
  const { annotation_project, ...cleaned } = filter as any;
  return cleaned as T;
}

export default function useFilterPresets<T extends Object>({
  storageKey,
  filter,
  maxRecents = 3,
}: {
  storageKey: string;
  filter: Filter<T>;
  maxRecents?: number;
}) {
  const savedKey = `${storageKey}:saved`;
  const recentKey = `${storageKey}:recents`;

  const [saved, setSaved] = useState<SavedPreset<T>[]>(() =>
    typeof window === "undefined" ? [] : safeParse<SavedPreset<T>[]>(localStorage.getItem(savedKey), []),
  );
  const [recents, setRecents] = useState<RecentPreset<T>[]>(() =>
    typeof window === "undefined" ? [] : safeParse<RecentPreset<T>[]>(localStorage.getItem(recentKey), []),
  );

  // Track recents when debounced filter changes
  const debouncedFilter = filter.filter;
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Do not record empty filter
    if (debouncedFilter == null || Object.keys(debouncedFilter).length === 0) return;
    
    // Strip annotation_project from the filter before processing
    const cleanedFilter = stripAnnotationProject(debouncedFilter);
    
    // Check if cleaned filter has any meaningful values
    const hasActiveFilters = Object.entries(cleanedFilter).some(([key, value]) => {
      // Skip prototype fields and null/undefined/empty values
      if (key.startsWith('__') || value == null || value === '') return false;
      
      if (typeof value === 'boolean') {
        return true; // Booleans are always meaningful
      } else if (Array.isArray(value)) {
        return value.length > 0;
      } else if (typeof value === 'object') {
        // For objects, check if they have meaningful display value
        if ('name' in value && value.name) return true;
        if ('start_date' in value || 'end_date' in value) {
          return Object.values(value).some(v => v != null && v !== '');
        }
        if ('uuid' in value && value.uuid) return true;
        // For other objects, check if they have meaningful content
        return Object.values(value).some(v => v != null && v !== '');
      }
      return true; // Strings and other primitive values
    });
    
    if (!hasActiveFilters) return;

    const now = Date.now();
    // Avoid duplicating identical consecutive entries
    const last = recents[0]?.filter;
    if (last && JSON.stringify(last) === JSON.stringify(cleanedFilter)) return;

    // Don't add to recent if it matches an existing saved preset
    const filterString = JSON.stringify(cleanedFilter);
    const isAlreadySaved = saved.some(savedPreset => 
      JSON.stringify(savedPreset.filter) === filterString
    );
    if (isAlreadySaved) return;

    const updated = [{ filter: cleanedFilter, savedAt: now }, ...recents]
      .slice(0, maxRecents);
    setRecents(updated);
    try {
      localStorage.setItem(recentKey, JSON.stringify(updated));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(debouncedFilter), saved]);

  const savePreset = useCallback(
    (name: string) => {
      if (typeof window === "undefined") return;
      const now = Date.now();
      const cleanedFilter = stripAnnotationProject(debouncedFilter);
      const existingIndex = saved.findIndex((p) => p.name === name);
      let updated: SavedPreset<T>[];
      if (existingIndex >= 0) {
        updated = saved.map((p, i) => (i === existingIndex ? { name, filter: cleanedFilter, savedAt: now } : p));
      } else {
        updated = [...saved, { name, filter: cleanedFilter, savedAt: now }];
      }
      setSaved(updated);
      try {
        localStorage.setItem(savedKey, JSON.stringify(updated));
      } catch {}
    },
    [saved, debouncedFilter, savedKey],
  );

  const deletePreset = useCallback(
    (name: string) => {
      if (typeof window === "undefined") return;
      const updated = saved.filter((p) => p.name !== name);
      setSaved(updated);
      try {
        localStorage.setItem(savedKey, JSON.stringify(updated));
      } catch {}
    },
    [saved, savedKey],
  );

  const applyPreset = useCallback(
    (preset: T) => {
      // Clear keys not present in preset
      const current = debouncedFilter as T;
      for (const key of Object.keys(current) as (keyof T)[]) {
        if (!(key in preset)) {
          filter.clear(key);
        }
      }
      // Set keys from preset
      for (const key of Object.keys(preset) as (keyof T)[]) {
        // @ts-ignore
        filter.set(key, preset[key]);
      }
      filter.submit();
    },
    [filter, debouncedFilter],
  );

  const recentList = useMemo(() => recents, [recents]);
  const savedList = useMemo(() => saved, [saved]);

  return {
    recentList,
    savedList,
    savePreset,
    deletePreset,
    applyPreset,
  } as const;
}

