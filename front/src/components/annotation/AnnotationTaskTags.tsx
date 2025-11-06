import { useMemo, useCallback, useState, useRef, useEffect } from "react";
import Card from "@/components/Card";
import Empty from "@/components/Empty";
import { H4 } from "@/components/Headings";
import { TagsIcon, BackIcon } from "@/components/icons";
import TagComponent, { TagCount, getTagKey } from "@/components/tags/Tag";
import SearchMenu from "../search/SearchMenu";
import Button from "../Button";
import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import KeyboardKey from "../KeyboardKey";
import type { AnnotationTask, Tag, SoundEventAnnotation } from "@/types";
import { ADD_TAG_SHORTCUT, REPLACE_TAG_SHORTCUT } from "@/utils/keyboard";

function NoTags() {
  return (
    <Empty padding="p-2">No sound event tags in this clip.</Empty>
  );
}

const allTag: Tag = { key: "all", value: "tags" }

function TagReplacePanel({
  taskTags,
  projectTags,
  onReplaceTag,
}: {
  taskTags: { tag: Tag; count: number }[];
  projectTags: Tag[];
  onReplaceTag: (oldTag: Tag | null, newTag: Tag) => void;
}) {
  const [selectedTagWithCount, setSelectedTagWithCount] = useState<{ tag: Tag; count: number } | null>(null);

  // Calculate total count
  const totalCount = useMemo(() =>
    taskTags.reduce((sum, { count }) => sum + count, 0),
    [taskTags]
  );

  const allOptions = useMemo(() => {
    if (taskTags.length == 0) {
      return taskTags
    }
    return [{ tag: allTag, count: totalCount }, ...taskTags]
  }, [taskTags, totalCount]);

  if (selectedTagWithCount === null) {
    return (
      <div className="p-4">
        <div className="mb-2 text-stone-700 dark:text-stone-300 underline underline-offset-2 decoration-amber-500 decoration-2">
          Replace ...
        </div>
        <SearchMenu
          limit={100}
          key="first-search"
          options={allOptions}
          fields={["type", "tag.key", "tag.value"]}
          renderOption={(option) =>
            <TagComponent
              key={getTagKey(option.tag)}
              tag={option.tag}
              onClose={() => { }}
              count={option.count}
            />

          }
          getOptionKey={(option) => `${option.tag.key}-${option.tag.value}`}
          onSelect={(option) => setSelectedTagWithCount(option)}
          empty={<div className="text-stone-500 text-center w-full">No tags found</div>}
          autoFocus
        />
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-2 flex flex-row items-center justify-between">
        <div>
          <span className="mb-2 text-stone-700 dark:text-stone-300 underline underline-offset-2 decoration-amber-500 decoration-2">Replace </span>
          <TagComponent
            key={getTagKey(selectedTagWithCount.tag)}
            tag={selectedTagWithCount.tag}
            onClose={() => { }}
            count={selectedTagWithCount.count}
          />
          <span className="mb-2 text-stone-700 dark:text-stone-300 underline underline-offset-2 decoration-amber-500 decoration-2"> with ...</span>
        </div>
        <Button
          mode="text"
          variant="warning"
          onClick={() => {
            setSelectedTagWithCount(null);
          }}
        >
          <BackIcon className="w-5 h-5" />
        </Button>
      </div>
      <SearchMenu
        limit={100}
        key="second-search"
        options={projectTags}
        fields={["key", "value"]}
        renderOption={(tag) => (
          <TagComponent
            key={getTagKey(tag)}
            tag={tag}
            onClose={() => { }}
            count={null}
          />
        )}
        getOptionKey={(tag) => `${tag.key}-${tag.value}`}
        onSelect={(newTag) => {
          onReplaceTag(
            selectedTagWithCount.tag,
            newTag
          );
          setSelectedTagWithCount(null);
        }}
        empty={<div className="text-stone-500 text-center w-full">No tags found</div>}
        autoFocus
      />
    </div>
  );
}


function TagAddPanel({
  projectTags,
  onReplaceTag,
}: {
  projectTags: Tag[];
  onReplaceTag: (oldTag: Tag | null, newTag: Tag) => void;
}) {
  return (
    <div className="p-4">
      <div className="mb-2 flex flex-row items-center justify-between">
        <div>
          <span className="mb-2 text-stone-700 dark:text-stone-300 underline underline-offset-2 decoration-amber-500 decoration-2">
            Select Tag to add
          </span>
        </div>
      </div>
      <SearchMenu
        limit={100}
        key="second-search"
        options={projectTags}
        fields={["key", "value"]}
        renderOption={(tag) => (
          <TagComponent
            key={getTagKey(tag)}
            tag={tag}
            onClose={() => { }}
            count={null}
          />
        )}
        getOptionKey={(tag) => `${tag.key}-${tag.value}`}
        onSelect={(newTag) => {
          onReplaceTag(
            null,
            newTag
          );
        }}
        empty={<div className="text-stone-500 text-center w-full">No tags found</div>}
        autoFocus
      />
    </div>
  );
}


export default function AnnotationTaskTags({
  annotationTask,
  projectTags,
  onReplaceTagInSoundEvents,
  selectedAnnotation,
}: {
  annotationTask: AnnotationTask;
  projectTags: Tag[];
  onReplaceTagInSoundEvents?: (oldTag: Tag | null, newTag: Tag | null, selectedAnnotation?: SoundEventAnnotation | null) => void;
  selectedAnnotation?: SoundEventAnnotation | null;
}) {

  const replaceButtonRef = useRef<HTMLButtonElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (!(event.key === REPLACE_TAG_SHORTCUT || event.key === ADD_TAG_SHORTCUT) ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (event.key === REPLACE_TAG_SHORTCUT) {
        if (!event.metaKey) {
          event.preventDefault();
          event.stopPropagation();
          const button = replaceButtonRef.current;
          if (button instanceof HTMLButtonElement) {
            button.click();
          }
        }
      }

      if (event.key === ADD_TAG_SHORTCUT && !event.metaKey && !event.shiftKey) {
        const button = addButtonRef.current;
        if (button instanceof HTMLButtonElement) {
          button.click();
        }
      }
    };
    // Add event listener to document
    document.addEventListener('keydown', handleKeyPress);

    // Cleanup
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, []);

  // This always shows all tags in the task
  const tagsWithCount = useMemo(() => {
    if (!annotationTask.sound_event_annotations) return [];

    const allTags = annotationTask.sound_event_annotations.flatMap(event => event.tags || []);
    const tagCounts = new Map<string, TagCount>();

    allTags.forEach(tag => {
      const key = `${tag.key}-${tag.value}`;
      const existing = tagCounts.get(key);
      if (existing) {
        existing.count++;
      } else {
        tagCounts.set(key, { tag, count: 1 });
      }
    });

    return Array.from(tagCounts.values());
  }, [annotationTask]);

  // This shows tags for the popover menus - either all tags or just selected annotation tags
  const popoverTagsWithCount = useMemo(() => {
    if (!annotationTask.sound_event_annotations) return [];

    const relevantSoundEvents = selectedAnnotation
      ? [selectedAnnotation]
      : annotationTask.sound_event_annotations;

    const allTags = relevantSoundEvents.flatMap(event => event.tags || []);
    const tagCounts = new Map<string, TagCount>();

    allTags.forEach(tag => {
      const key = `${tag.key}-${tag.value}`;
      const existing = tagCounts.get(key);
      if (existing) {
        existing.count++;
      } else {
        tagCounts.set(key, { tag, count: 1 });
      }
    });

    return Array.from(tagCounts.values());
  }, [annotationTask, selectedAnnotation]);

  const handleTagReplaceRemove = useCallback(
    async (oldTag: Tag | null, newTag: Tag | null) => {
      await onReplaceTagInSoundEvents?.(oldTag, newTag, selectedAnnotation);
    },
    [onReplaceTagInSoundEvents, selectedAnnotation]
  );

  return (
    <Card>
      <div className="flex justify-between items-center gap-2 mb-2">
        <H4 className="text-center whitespace-nowrap">
          <TagsIcon className="inline-block mr-1 w-5 h-5" />
          All Sound Event Tags
        </H4>
        <div className="flex items-center">
          <Popover as="div" className="relative inline-block text-left">
            {({ open, close }) => {
              return (
                <>
                  <div className="group relative">
                    <PopoverButton as="div"
                      className={`
              inline-flex items-center justify-center text-sm font-medium
              text-info-600 hover:text-info-700
            `}
                    >
                      <Button
                        ref={replaceButtonRef}
                        mode="text"
                        variant="info"
                        type="button"
                        autoFocus={false}
                      >
                        Replace
                      </Button>
                    </PopoverButton>
                    <div
                      className="
                      opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100
                      transition duration-100 ease-out
                      pointer-events-none
                      absolute top-full left-1/2 -translate-x-1/2 mt-2 
                      rounded p-2 shadow-lg 
                      bg-stone-50 dark:bg-stone-700 
                      text-stone-600 dark:text-stone-400 
                      text-sm
                      z-50 whitespace-nowrap
                    "
                    >
                      <div className="inline-flex gap-2 items-center">
                        Replace Tags in Task
                        <div className="text-xs">
                          <KeyboardKey code={REPLACE_TAG_SHORTCUT} />
                        </div>
                      </div>
                    </div>
                  </div>
                  <PopoverPanel
                    unmount
                    onMouseDown={(e) => e.preventDefault()}
                    className="absolute right-0 mt-2 w-96 divide-y divide-stone-100 rounded-md bg-stone-50 dark:bg-stone-700 border border-stone-200 dark:border-stone-500 shadow-md dark:shadow-stone-800 ring-1 ring-stone-900 ring-opacity-5 focus:outline-none z-50 origin-top-right transition transform data-[closed]:scale-95 data-[closed]:opacity-0 data-[enter]:duration-100 data-[leave]:duration-75 data-[enter]:ease-out data-[leave]:ease-in"
                  >
                    <TagReplacePanel
                      taskTags={popoverTagsWithCount}
                      projectTags={projectTags}
                      onReplaceTag={async (oldTag, newTag) => {
                        close();
                        await handleTagReplaceRemove(oldTag, newTag);
                      }}
                    />
                  </PopoverPanel>
                </>
              );
            }}
          </Popover>
          <div className="h-4 w-px bg-stone-200 dark:bg-stone-600 mx-2" />
          <Popover as="div" className="relative inline-block text-left">
            {({ open, close }) => {
              return (
                <>
                  <div className="group relative">
                    <PopoverButton as="div"
                      className={`
              inline-flex items-center justify-center text-sm font-medium
              text-info-600 hover:text-info-700
            `}
                    >
                      <Button
                        ref={addButtonRef}
                        mode="text"
                        variant="info"
                        type="button"
                        autoFocus={false}
                      >
                        Add
                      </Button>
                    </PopoverButton>
                    <div
                      className="
              opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100
              transition duration-100 ease-out
              pointer-events-none
              absolute top-full left-1/2 -translate-x-1/2 mt-2 
              rounded p-2 shadow-lg 
              bg-stone-50 dark:bg-stone-700 
              text-stone-600 dark:text-stone-400 
              text-sm
              z-50 whitespace-nowrap
            "
                    >
                      <div className="inline-flex gap-2 items-center">
                        Add Tags to all Sound Events
                        <div className="text-xs">
                          <KeyboardKey code={ADD_TAG_SHORTCUT} />
                        </div>
                      </div>
                    </div>
                  </div>
                  <PopoverPanel
                    unmount
                    onMouseDown={(e) => e.preventDefault()}
                    className="absolute right-0 mt-2 w-96 divide-y divide-stone-100 rounded-md bg-stone-50 dark:bg-stone-700 border border-stone-200 dark:border-stone-500 shadow-md dark:shadow-stone-800 ring-1 ring-stone-900 ring-opacity-5 z-50 origin-top-right transition transform data-[closed]:scale-95 data-[closed]:opacity-0 data-[enter]:duration-100 data-[leave]:duration-75 data-[enter]:ease-out data-[leave]:ease-in"
                  >
                    <TagAddPanel
                      projectTags={projectTags}
                      onReplaceTag={async (_, newTag) => {
                        close();
                        await handleTagReplaceRemove(null, newTag);
                      }}
                    />
                  </PopoverPanel>
                </>
              );
            }}
          </Popover>
        </div>


      </div>
      <div className="flex flex-row items-center flex-wrap gap-1">
        {tagsWithCount.map(({ tag, count }) => (
          <TagComponent
            key={getTagKey(tag)}
            tag={tag}
            onClose={() => handleTagReplaceRemove(tag, null)}
            count={count}
          />
        ))}
        {tagsWithCount.length === 0 && <NoTags />}
      </div>
    </Card>
  );
}