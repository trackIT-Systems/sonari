import Button from "@/components/Button";
import Card from "@/components/Card";
import { H3 } from "@/components/Headings";
import TagList from "@/components/tags/TagList";
import TagSearchBar from "@/components/tags/TagSearchBar";
import type { Tag } from "@/types";

interface ExportTagSelectionProps {
  selectedTags: Tag[];
  onTagSelect: (tag: Tag) => void;
  onTagDeselect: (tag: Tag) => void;
  onSelectAllTags: () => void;
}

export default function ExportTagSelection({
  selectedTags,
  onTagSelect,
  onTagDeselect,
  onSelectAllTags,
}: ExportTagSelectionProps) {
  return (
    <Card>
      <div>
        <H3 className="text-lg">Tags</H3>
        <p className="text-stone-500">Select tags that should be exported.</p>
      </div>
      <div className="grid grid-cols-2 gap-y-4 gap-x-14 overflow-visible">
        <div className="col-span-2 md:col-span-1 overflow-visible">
          <label className="block mb-2 font-medium text-stone-600 dark:text-stone-400">Add Tags</label>
          <div className="flex items-center justify-between mb-2">
            <small className="text-stone-500">Search and select tags to add to the export.</small>
            <Button
              variant="secondary"
              mode="outline"
              padding="px-3 py-1.5"
              onClick={onSelectAllTags}
            >
              Select all
            </Button>
          </div>
          <div className="py-2">
            <TagSearchBar
              placeholder="Search tags..."
              excludeTags={selectedTags}
              onSelect={(tag) => {
                onTagSelect(tag);
              }}
              autoFocus={false}
            />
          </div>
        </div>
        <div className="col-span-2 md:col-span-1">
          <label className="block mb-2 font-medium text-stone-600 dark:text-stone-400">Selected Tags</label>
          <small className="text-stone-500">Click on a tag to remove it from the export selection.</small>
          <div className="py-2">
            <TagList autoFocus={false} tags={selectedTags} onClick={onTagDeselect} />
          </div>
        </div>
      </div>
    </Card>
  );
}
