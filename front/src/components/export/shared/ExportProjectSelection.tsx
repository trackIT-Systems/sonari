import Card from "@/components/Card";
import { H3 } from "@/components/Headings";
import TagList from "@/components/tags/TagList";
import type { Tag } from "@/types";

interface ExportProjectSelectionProps {
  projectTagList: Tag[];
  selectedProjectTags: Tag[];
  onProjectSelect: (tag: Tag) => void;
  onProjectDeselect: (tag: Tag) => void;
}

export default function ExportProjectSelection({
  projectTagList,
  selectedProjectTags,
  onProjectSelect,
  onProjectDeselect,
}: ExportProjectSelectionProps) {
  return (
    <Card>
      <div>
        <H3 className="text-lg">Projects</H3>
        <p className="text-stone-500">Select projects to include in the export.</p>
      </div>
      <div className="grid grid-cols-2 gap-y-4 gap-x-14">
        <div className="col-span-2 md:col-span-1">
          <label className="block mb-2 font-medium text-stone-600 dark:text-stone-400">Available Projects</label>
          <small className="text-stone-500">Click a project to add it to the export selection.</small>
          <div className="py-2">
            <TagList autoFocus={true} tags={projectTagList} onClick={onProjectSelect} />
          </div>
        </div>
        <div className="col-span-2 md:col-span-1">
          <label className="block mb-2 font-medium text-stone-600 dark:text-stone-400">Selected Projects</label>
          <small className="text-stone-500">Click a tag to remove it from the export selection.</small>
          <div className="py-2">
            <TagList autoFocus={false} tags={selectedProjectTags} onClick={onProjectDeselect} />
          </div>
        </div>
      </div>
    </Card>
  );
}
