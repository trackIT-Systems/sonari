import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useKeyPressEvent } from "react-use";
import useKeyFilter from "@/hooks/utils/useKeyFilter";
import type { AnnotationTaskFilter } from "@/api/annotation_tasks";
import type { AnnotationTask } from "@/types";
import useAnnotationTasks from "@/hooks/api/useAnnotationTasks";
import useAnnotationTaskTable from "@/hooks/useAnnotationTaskTable";
import Loading from "@/app/loading";
import Search from "@/components/inputs/Search";
import FilterPopover from "@/components/filters/FilterMenu";
import tasksFilterDefs from "../filters/tasks";
import FilterBar from "@/components/filters/FilterBar";
import Table from "@/components/tables/Table";
import Pagination from "@/components/lists/Pagination";
import { LIST_OVERVIEW_DOWN_SHORTCUT, SEARCH_BAR_LEAVE_SHORTCUT, FILTER_POPOVER_SHORTCUT } from "@/utils/keyboard";
import Button from "../Button";
import { FilterIcon } from "../icons";

export default function AnnotationTaskTable({
  filter,
  fixed,
  getAnnotationTaskLink,
  pathFormatter,
}: {
  filter: AnnotationTaskFilter;
  fixed?: (keyof AnnotationTaskFilter)[];
  getAnnotationTaskLink?: (annotationTask: AnnotationTask) => string;
  pathFormatter?: (path: string) => string;
}) {
  const annotationTasks = useAnnotationTasks({ filter, fixed });
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [focusedElement, setFocusedElement] = useState<'search' | 'filter' | number>(-1);
  const router = useRouter();
  const popoverButtonRef = useRef<HTMLButtonElement>(null);

  const table = useAnnotationTaskTable({
    data: annotationTasks.items,
    getAnnotationTaskLink: getAnnotationTaskLink,
    pathFormatter
  });

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === LIST_OVERVIEW_DOWN_SHORTCUT) {
      e.preventDefault();
      if (annotationTasks.items.length > 0) {
        setFocusedElement(0);
        searchInputRef.current?.blur();
      }
    }
  }, [annotationTasks.items]);

  useKeyPressEvent(useKeyFilter({ key: SEARCH_BAR_LEAVE_SHORTCUT }), (event) => {
    if (focusedElement === -1) {
      event.preventDefault();
      setFocusedElement('search');
      searchInputRef.current?.focus();
    }
  });

  const handleTableFocus = useCallback((index: number) => {
    if (index === -1) {
      setFocusedElement('search');
      searchInputRef.current?.focus();
    } else {
      setFocusedElement(index);
    }
  }, [setFocusedElement, searchInputRef]);

  const handleSelect = useCallback((task: AnnotationTask) => {
    const link = getAnnotationTaskLink?.(task);
    if (link) {
      router.push(`/annotation_projects/${link}`);
    }
  }, [router, getAnnotationTaskLink]);

  const btn = <Button
    padding="0"
    className="border-none"
    autoFocus={false}
    ref={popoverButtonRef}
  >
    <FilterIcon className="h-4 w-4 stroke-2" />
  </Button>

  useKeyPressEvent(FILTER_POPOVER_SHORTCUT, (event: KeyboardEvent) => {
    const button = popoverButtonRef.current;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }
    if (button instanceof HTMLButtonElement && focusedElement !== 'search' && focusedElement !== 'filter') {
      button.click();
    }
  });

  if (annotationTasks.isLoading || annotationTasks.data == null) {
    return <Loading />;
  }
  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex flex-row justify-between space-x-4">
        <div className="flex flex-row space-x-3 basis-1/2">
          <div className="grow">
            <Search
              label="Search"
              placeholder="Search recordings..."
              value={annotationTasks.filter.get("search_recordings") ?? ""}
              onChange={(value) =>
                annotationTasks.filter.set("search_recordings", value as string)
              }
              onKeyDown={handleSearchKeyDown}
              inputRef={searchInputRef}
              isHighlighted={focusedElement === 'search'}
            />
          </div>
          <FilterPopover
            filter={annotationTasks.filter}
            filterDef={tasksFilterDefs}
            button={btn}
            

          />
        </div>
      </div>
      <FilterBar
        filter={annotationTasks.filter}
        total={annotationTasks.total}
        filterDef={tasksFilterDefs}
      />
      <div className="w-full">
        <div className="overflow-x-auto overflow-y-auto w-full max-h-screen rounded-md outline outline-1 outline-stone-200 dark:outline-stone-800">
          <Table
            table={table}
            selectedIndex={typeof focusedElement === 'number' ? focusedElement : -1}
            onFocusChange={handleTableFocus}
            onSelect={handleSelect}
            handleNumberKeys={focusedElement !== 'search' && focusedElement !== 'filter'}
          />
        </div>
      </div>
      <Pagination {...annotationTasks.pagination} />
    </div>
  );
}