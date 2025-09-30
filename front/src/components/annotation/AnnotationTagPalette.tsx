import { useCallback, memo } from "react";

import Button from "@/components/Button";
import Card from "@/components/Card";
import { H4 } from "@/components/Headings";
import { DeleteIcon, ToolsIcon } from "@/components/icons";
import TagComponent, { getTagKey } from "@/components/tags/Tag";
import TagSearchBar from "@/components/tags/TagSearchBar";
import Tooltip from "@/components/Tooltip";

import type { TagFilter } from "@/api/tags";
import type { Tag } from "@/types";

// Memoized tag item to prevent recreating callbacks on each render
const MemoizedTagItem = memo(function MemoizedTagItem({
  tag,
  onClick,
  onRemove,
}: {
  tag: Tag;
  onClick?: (tag: Tag) => void;
  onRemove?: (tag: Tag) => void;
}) {
  const handleClick = useCallback(() => onClick?.(tag), [onClick, tag]);
  const handleClose = useCallback(() => onRemove?.(tag), [onRemove, tag]);

  return (
    <TagComponent
      tag={tag}
      onClick={handleClick}
      onClose={handleClose}
      count={null}
    />
  );
});

export default function AnnotationTagPalette({
  tags,
  tagFilter,
  onClick,
  onAddTag,
  onCreateTag,
  onRemoveTag,
  onClearTags,
}: {
  tags: Tag[];
  tagFilter?: TagFilter;
  onCreateTag?: (tag: Tag) => void;
  onClick?: (tag: Tag) => void;
  onAddTag?: (tag: Tag) => void;
  onRemoveTag?: (tag: Tag) => void;
  onClearTags?: () => void;
}) {
  return (
    <Card>
      <H4 className="text-center">
        <Tooltip
          tooltip={
            <div className="w-48 text-center">
              The tags selected here will be automatically attached to newly
              created annotations.
            </div>
          }
          placement="top"
        >
          <ToolsIcon className="inline-block w-5 h-5 mr-1" />
          <span className="cursor-help">Tag Palette</span>
        </Tooltip>
      </H4>
      <div className="flex flex-row gap-1 w-full">
        <Tooltip tooltip="Clear tags" placement="top">
          <Button onClick={onClearTags} mode="text" variant="danger">
            <DeleteIcon className="w-5 h-5" />
          </Button>
        </Tooltip>
        <div className="grow">
          <TagSearchBar
            onSelect={onAddTag}
            onCreate={onCreateTag}
            initialFilter={tagFilter}
            placeholder="Add tags..."
            autoFocus={false}
          />
        </div>
      </div>
      <div className="flex flex-row flex-wrap gap-1">
        {tags.map((tag) => (
          <MemoizedTagItem
            key={getTagKey(tag)}
            tag={tag}
            onClick={onClick}
            onRemove={onRemoveTag}
          />
        ))}
      </div>
    </Card>
  );
}
