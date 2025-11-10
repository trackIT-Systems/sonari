import Fuse, { type FuseOptionKey } from "fuse.js";
import { useMemo, useState } from "react";

export default function useListWithSearch<T extends Object>({
  options,
  fields,
  limit: initialLimit = 20,
  shouldSort = true,
}: {
  options: T[];
  fields: FuseOptionKey<T>[];
  limit?: number;
  shouldSort?: boolean;
}) {
  const [limit, setLimit] = useState(initialLimit);
  const [search, setSearch] = useState("");

  // Ensure options is always an array
  const safeOptions = options || [];

  const fuse = useMemo(
    () =>
      new Fuse(safeOptions, {
        keys: fields,
        threshold: 0.3,
        shouldSort: shouldSort,
        includeMatches: false,
        includeScore: false,
      }),
    [safeOptions, fields, shouldSort],
  );

  const filteredOptions = useMemo(() => {
    if (search === "") return safeOptions.slice(0, limit);
    return fuse.search(search, { limit }).map((result) => result.item);
  }, [search, fuse, safeOptions, limit]);

  return {
    items: filteredOptions,
    limit,
    search,
    setSearch,
    setLimit,
    hasMore: limit < safeOptions.length,
  };
}
