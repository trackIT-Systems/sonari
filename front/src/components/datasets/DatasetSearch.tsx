import { useCallback, useMemo } from "react";
import { Item } from "react-stately";

import Search from "@/components/search/Search";
import useDatasets from "@/hooks/api/useDatasets";

import type { Dataset } from "@/types";

export default function DatasetSearch({
  autoFocus,
  selected,
  onSelect,
  showMax = 10,
}: {
  autoFocus?: boolean;
  selected?: Dataset | null;
  onSelect?: (dataset: Dataset) => void;
  emptyMessage?: string;
  showMax?: number;
}) {
  const filter = useMemo(() => ({ search: "" }), []);

  const {
    isLoading,
    items,
    filter: { set: setFilter },
  } = useDatasets({
    pageSize: showMax * 4,
    filter,
  });

  const onChangeSearch = useCallback(
    (search: string) => setFilter("search", search),
    [setFilter],
  );

  return (
    <Search
      autoFocus
      label="search-datasets"
      value={selected}
      options={items}
      fields={["name", "description"]}
      displayValue={(dataset) => dataset.name}
      getOptionKey={(dataset) => dataset.id.toString()}
      onChangeSearch={onChangeSearch}
      onSelect={onSelect}
      showMax={showMax}
      isLoading={isLoading}
    >
      {(dataset) => <Item key={dataset.id}>{dataset.name}</Item>}
    </Search>
  );
}
