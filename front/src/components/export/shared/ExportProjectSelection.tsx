import Card from "@/components/Card";
import { H3 } from "@/components/Headings";
import TagList from "@/components/tags/TagList";
import Loading from "@/components/Loading";
import type { Tag } from "@/types";

interface ExportProjectSelectionProps {
  projectTagList: Tag[];
  selectedProjectTags: Tag[];
  onProjectSelect: (tag: Tag) => void;
  onProjectDeselect: (tag: Tag) => void;
  isLoadingProjects?: boolean;
  totalProjects?: number;
}

export default function ExportProjectSelection({
  projectTagList,
  selectedProjectTags,
  onProjectSelect,
  onProjectDeselect,
  isLoadingProjects = false,
  totalProjects = 0,
}: ExportProjectSelectionProps) {
  return (
    <Card>
      <div>
        <H3 className="text-lg">Projects</H3>
        <p className="text-stone-500">Select projects to include in the export.</p>
      </div>
      <div className="grid grid-cols-2 gap-y-4 gap-x-14">
        <div className="col-span-2 md:col-span-1">
          <label className="block mb-2 font-medium text-stone-600 dark:text-stone-400">
            Available Projects
            {totalProjects > 0 && (
              <span className="ml-2 text-sm text-stone-500">({totalProjects} total)</span>
            )}
          </label>
          <small className="text-stone-500">Click a project to add it to the export selection.</small>
          <div className="py-2 max-h-64 overflow-y-auto">
            {isLoadingProjects ? (
              <div className="flex justify-center p-4">
                <Loading />
              </div>
            ) : (
              <TagList autoFocus={true} tags={projectTagList} onClick={onProjectSelect} />
            )}
          </div>
        </div>
        <div className="col-span-2 md:col-span-1">
          <label className="block mb-2 font-medium text-stone-600 dark:text-stone-400">Selected Projects</label>
          <small className="text-stone-500">Click a tag to remove it from the export selection.</small>
          <div className="py-2 max-h-64 overflow-y-auto">
            <TagList autoFocus={false} tags={selectedProjectTags} onClick={onProjectDeselect} />
          </div>
        </div>
      </div>
    </Card>
  );
}
