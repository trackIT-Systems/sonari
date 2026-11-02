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
    <Card className="gap-2 p-3">
      <H4 className="flex items-center gap-1.5 text-sm">
        <TagsIcon className="h-4 w-4 shrink-0" />
        Task tags
      </H4>

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

