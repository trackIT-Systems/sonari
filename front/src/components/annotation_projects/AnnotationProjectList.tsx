import { useCallback, ReactElement, useState, useEffect, useRef } from "react";
import { useKeyPressEvent } from "react-use";
import useKeyFilter from "@/hooks/utils/useKeyFilter";
import { useRouter } from "next/navigation";
import Loading from "@/app/loading";
import AnnotationProjectComponent from "@/components/annotation_projects/AnnotationProject";
import Empty from "@/components/Empty";
import {
  AddIcon,
  DatasetIcon,
  WarningIcon,
} from "@/components/icons";
import Search from "@/components/inputs/Search";
import Pagination from "@/components/lists/Pagination";
import StackedList from "@/components/lists/StackedList";
import useAnnotationProjects from "@/hooks/api/useAnnotationProjects";
import { LIST_OVERVIEW_DOWN_SHORTCUT, SEARCH_BAR_LEAVE_SHORTCUT } from "@/utils/keyboard";

import type { AnnotationProject } from "@/types";

function NoProjects() {
  return (
    <Empty>
      <WarningIcon className="w-16 h-16 text-stone-500" />
      <p>No annotation project exist yet!</p>
      <p>
        To create a new project, click on the
        <span className="text-emerald-500">
          <AddIcon className="inline-block mr-1 ml-2 w-4 h-4" />
          Create{" "}
        </span>{" "}
        button above.
      </p>
    </Empty>
  );
}

export default function AnnotationProjectList({
  onCreate,
}: {
  onCreate?: (annotationProject: Promise<AnnotationProject>) => void;
}) {
  const { items, pagination, isLoading, filter } = useAnnotationProjects();
  const router = useRouter();
  const [selectedAnnotationProject, setselectedAnnotationProject] = useState<AnnotationProject | null>(null);
  const [shouldNavigate, setShouldNavigate] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [focusedElement, setFocusedElement] = useState<'search' | number>(-1);

  useEffect(() => {
    if (shouldNavigate && selectedAnnotationProject) {
      router.push(`/annotation_projects/detail/?annotation_project_id=${selectedAnnotationProject.id}`);
      setShouldNavigate(false);
    }
  }, [shouldNavigate, selectedAnnotationProject, router, setShouldNavigate]);

  const handleSelect = useCallback(() => {
    setShouldNavigate(true);
  }, [setShouldNavigate]);

  const handleHighlight = useCallback((item: ReactElement) => {
    const project = (item as any).props.annotationProject;
    setselectedAnnotationProject(project);
  }, [setselectedAnnotationProject]);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === LIST_OVERVIEW_DOWN_SHORTCUT) {
      e.preventDefault();
      if (items.length > 0) {
        setFocusedElement(0);
        setselectedAnnotationProject(items[0]);
        searchInputRef.current?.blur();
      }
    }
  }, [items, setFocusedElement, setselectedAnnotationProject, searchInputRef]);

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
            placeholder="Search project..."
            value={filter.get("search")}
            onChange={(value) => filter.set("search", value as string)}
            onSubmit={() => filter.submit()}
            icon={<DatasetIcon />}
            onKeyDown={handleSearchKeyDown}
            inputRef={searchInputRef as React.RefObject<HTMLInputElement>}
            isHighlighted={focusedElement === 'search'}
          />
        </div>
      </div>
      {isLoading ? (
        <Empty>
          <div className="p-8">
            <Loading />
          </div>
        </Empty>
      ) : items.length === 0 ? (
        <NoProjects />
      ) : (
        <>
          <StackedList
            items={items.map((item) => (
              <AnnotationProjectComponent
                key={item.id}
                annotationProject={item}
              />
            ))}
            onSelect={handleSelect}
            onHighlight={handleHighlight}
            onFocusChange={handleStackedListFocus}
            selectedIndex={typeof focusedElement === 'number' ? focusedElement : -1}
            handleNumberKeys={focusedElement !== 'search'}
          />
        </>
      )}
      {pagination.numPages > 1 && <Pagination {...pagination} />}
    </div>
  );
}
