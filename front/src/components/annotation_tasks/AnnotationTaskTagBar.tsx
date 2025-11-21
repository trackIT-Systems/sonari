import { TagsIcon } from "@/components/icons";
import AddTagButton from "@/components/tags/AddTagButton";
import TagComponent, { getTagKey } from "@/components/tags/Tag";
import { H4 } from "../Headings";

import type { AnnotationTask, Tag } from "@/types";
import Card from "../Card";

export default function AnnotationTaskTagBar({
  annotationTask,
  onAddTag,
  onRemoveTag,
}: {
  annotationTask: AnnotationTask;
  onAddTag?: (tag: Tag) => void;
  onRemoveTag?: (tag: Tag) => void;
}) {
  const tags = annotationTask.tags || [];

  return (
    <Card>
      <div className="flex justify-between items-center gap-2 mb-2">
        <H4 className="text-center whitespace-nowrap pt-3">
          <TagsIcon className="inline-block mr-1 w-5 h-5" />
          Annotation Task Tags
        </H4>
      </div>

      <div className="flex flex-row items-center flex-wrap gap-1">
        {tags.map((tag: Tag) => (
          <TagComponent
            key={getTagKey(tag)}
            tag={tag}
            onClose={() => onRemoveTag?.(tag)}
            count={null}
          />
        ))}
        {tags.length === 0 && (
          <span className="text-stone-400 dark:text-stone-600 text-sm">
            No tags
          </span>
        )}

        <AddTagButton
          variant="primary"
          onAdd={onAddTag}
        />
      </div>
    </Card>
  );
}

