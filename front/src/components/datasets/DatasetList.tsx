import { useCallback, ReactElement, useState, useEffect, useRef } from "react";
import { useKeyPressEvent } from "react-use";
import useKeyFilter from "@/hooks/utils/useKeyFilter";
import { useRouter } from "next/navigation";
import DatasetComponent from "@/components/datasets/Dataset";
import Empty from "@/components/Empty";
import {
  AddIcon,
  DatasetIcon,
  WarningIcon,
} from "@/components/icons";
import Search from "@/components/inputs/Search";
import Pagination from "@/components/lists/Pagination";
import StackedList from "@/components/lists/StackedList";
import Loading from "@/components/Loading";
import useDatasets from "@/hooks/api/useDatasets";
import { LIST_OVERVIEW_DOWN_SHORTCUT, SEARCH_BAR_LEAVE_SHORTCUT } from "@/utils/keyboard";

import type { Dataset } from "@/types";

/**
 * Component to display a message when no datasets are found.
 *
 * @returns JSX element providing information and guidance when no datasets are
 * found.
 */
function NoDatasets() {
  return (
    <Empty>
      <WarningIcon className="w-8 h-8 text-stone-500" />
      <p>No datasets found.</p>
      <p>
        To create a dataset, click on the
        <span className="text-emerald-500">
          <AddIcon className="inline-block mr-1 ml-2 w-4 h-4" />
          Create{" "}
        </span>{" "}
        button above.
      </p>
    </Empty>
  );
}

/**
 * Component to display a list of datasets along with search functionality,
 * create and import links.
 *
 * @returns JSX element displaying a list of datasets with search and
 * navigation options.
 */
export default function DatasetList(props: {
  onCreate?: (dataset: Promise<Dataset>) => void;
}) {
  const { onCreate } = props;
  const datasets = useDatasets();
  const router = useRouter();
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [shouldNavigate, setShouldNavigate] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [focusedElement, setFocusedElement] = useState<'search' | number>(-1);

  useEffect(() => {
    if (shouldNavigate && selectedDataset) {
      router.push(`/datasets/detail/?dataset_uuid=${selectedDataset.uuid}`);
      setShouldNavigate(false);
    }
  }, [shouldNavigate, selectedDataset, router, setShouldNavigate]);

  const handleSelect = useCallback(() => {
    setShouldNavigate(true);
  }, [setShouldNavigate]);

  const handleHighlight = useCallback((item: ReactElement) => {
    const dataset = (item as any).props.dataset;
    setSelectedDataset(dataset);
  }, [setSelectedDataset]);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === LIST_OVERVIEW_DOWN_SHORTCUT) {
      e.preventDefault();
      if (datasets.items.length > 0) {
        setFocusedElement(0);
        setSelectedDataset(datasets.items[0]);
        searchInputRef.current?.blur();
      }
    }
  }, [datasets, setFocusedElement, setSelectedDataset, searchInputRef]);

  useKeyPressEvent(useKeyFilter({ key: SEARCH_BAR_LEAVE_SHORTCUT }), (event) => {
    if (focusedElement === -1) {
      event.preventDefault();
      setFocusedElement('search');
      searchInputRef.current?.focus();
    }
  });

  const handleStackedListFocus = useCallback((index: number) => {
    if (index === -1) {
      setFocusedElement('search');
      searchInputRef.current?.focus();
    } else {
      setFocusedElement(index);
    }
  }, [searchInputRef, setFocusedElement]);


  return (
    <div className="flex flex-col p-8 space-y-2 w-full">
      <div className="flex flex-row space-x-4">
        <div className="flex-grow">
          <Search
            label="Search"
            placeholder="Search dataset..."
            value={datasets.filter.get("search")}
            // @ts-ignore
            onChange={(value) => datasets.filter.set("search", value)}
            onSubmit={() => datasets.filter.submit()}
            icon={<DatasetIcon />}
            onKeyDown={handleSearchKeyDown}
            inputRef={searchInputRef as React.RefObject<HTMLInputElement>}
            isHighlighted={focusedElement === 'search'}
          />
        </div>
      </div>
      {datasets.isLoading ? (
        <Loading />
      ) : (
        <>
          {datasets.items.length === 0 && <NoDatasets />}
          <StackedList
            items={datasets.items.map((item) => (
              <DatasetComponent key={item.uuid} dataset={item} />
            ))}
            onSelect={handleSelect}
            onHighlight={handleHighlight}
            onFocusChange={handleStackedListFocus}
            selectedIndex={typeof focusedElement === 'number' ? focusedElement : -1}
            handleNumberKeys={focusedElement !== 'search'}
          />
          {datasets.pagination.numPages > 1 && (
            <Pagination {...datasets.pagination} />
          )}
        </>
      )}
    </div>
  );
}
