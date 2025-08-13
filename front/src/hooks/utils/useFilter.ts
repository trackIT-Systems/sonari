import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDebounce } from "react-use";

/**
 * Represents a generic filter state object with various utility functions.
 */
export type Filter<T extends Object> = {
  /** The current filter state. */
  filter: T;
  /**
   * Sets the value for a specific key in the filter state.
   * @param key - The key to set.
   * @param value - The value to set for the key.
   * @param force - If true, sets the value even if the key is fixed.
   */
  set: <K extends keyof T>(key: K, value: T[K], force?: boolean) => void;
  /**
   * Gets the value for a specific key in the filter state.
   * @param key - The key to get.
   * @returns The value for the specified key.
   */
  get: <K extends keyof T>(key: K) => T[K];
  /**
   * Clears the value for a specific key in the filter state.
   * @param key - The key to clear.
   * @param force - If true, clears the value even if the key is fixed.
   */
  clear: <K extends keyof T>(key: K, force?: boolean) => void;
  /** Resets the filter state to its default and fixed values. */
  reset: () => void;
  /** Submits the current filter state.
   * This is particularly useful when the filter state is debounced.
   */
  submit: () => void;
  /**
   * Checks if a specific key in the filter state is fixed.
   * @param key - The key to check.
   * @returns True if the key is fixed, false otherwise.
   */
  isFixed: <K extends keyof T>(key: K) => boolean;
  /** The count of non-fixed keys in the filter state. */
  size: number;
};

const _fixed: any[] = [];

/**
 * A React hook for managing a debounced filter state object.
 * The filter state is debounced by default.
 *
 * @param defaults - The default filter state.
 * @param fixed - An array of keys that cannot be changed.
 * @param debounce - The debounce time in milliseconds.
 * @returns An object with the filter state, a set function, a get function,
 * and utility functions for managing the state.
 */
export default function useFilter<T extends Object>({
  defaults,
  fixed = _fixed,
  debounce = 500,
  persistKey,
}: {
  defaults: T;
  fixed?: (keyof T)[];
  debounce?: number;
  prefix?: string;
  persistKey?: string;
}): Filter<T> {
  // Initialize from persisted storage if available, otherwise from defaults
  const initialState = useMemo(() => {
    if (!persistKey) return defaults;
    if (typeof window === "undefined") return defaults;
    try {
      const raw = window.localStorage.getItem(persistKey);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw) as T;
      const enforced: T = { ...parsed } as T;
      for (const key of fixed) {
        if (key in defaults) {
          // @ts-ignore
          enforced[key] = defaults[key];
        } else {
          // @ts-ignore
          delete enforced[key];
        }
      }
      return enforced;
    } catch {
      return defaults;
    }
  }, [persistKey, defaults, fixed]);

  const [state, setState] = useState<T>(initialState);
  const [debouncedState, setDebouncedState] = useState<T>(initialState);

  // Reset the state when the fixed filter changes
  const prevDefaultsRef = useRef<T>(defaults);
  useEffect(() => {
    // Only react when defaults reference actually changes after mount
    if (prevDefaultsRef.current !== defaults) {
      setState(defaults);
      setDebouncedState(defaults);
      prevDefaultsRef.current = defaults;
    }
  }, [defaults]);

  // (Removed separate hydration effect; handled in initialState)

  const isFixed = useCallback((key: keyof T) => fixed.includes(key), [fixed]);

  const set = useCallback(
    <K extends keyof T>(
      key: K,
      value: (typeof state)[K],
      force: boolean = false,
    ) => {
      if (isFixed(key) && !force) return;
      setState((prev) => ({ ...prev, [key]: value }));
    },
    [isFixed],
  );
  const get = useCallback(
    <K extends keyof T>(key: K): (typeof state)[K] => state[key],
    [state],
  );
  const clear = useCallback(
    <K extends keyof T>(key: K, force: boolean = false) => {
      if (isFixed(key) && !force) return;
      setState((prev) => {
        // Delete the key from a copy of the state
        const newState = { ...prev };
        delete newState[key];

        // Do not debounce when clearing
        setDebouncedState(newState);

        return newState;
      });
    },
    [isFixed],
  );
  const reset = useCallback(() => setState(defaults), [defaults]);

  useDebounce(
    () => {
      setDebouncedState(state);
    },
    debounce,
    [state],
  );

  const submit = useCallback(() => {
    setDebouncedState(state);
  }, [state]);

  // Persist debounced state to localStorage
  useEffect(() => {
    if (!persistKey) return;
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(persistKey, JSON.stringify(debouncedState));
    } catch {
      // ignore quota errors
    }
  }, [debouncedState, persistKey]);

  const size = useMemo(() => {
    // @ts-ignore
    return Object.keys(state).filter((key) => !isFixed(key)).length;
  }, [state, isFixed]);

  return {
    filter: debouncedState,
    set,
    get,
    clear,
    reset,
    submit,
    size,
    isFixed,
  };
}
