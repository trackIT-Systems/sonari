import { useMemo } from "react";

import { H4 } from "@/components/Headings";
import Empty from "@/components/Empty";
import { TagsIcon } from "@/components/icons";
import TagComponent, { getTagKey } from "@/components/tags/Tag";
import type { Tag, ClipPrediction, Interval } from "@/types";

const DEFAULT_THRESHOLD: Interval = { min: 0.5, max: 1 };

export default function ClipPredictionTags(props: {
  clipPrediction: ClipPrediction;
  onTagClick?: (tag: Tag) => void;
  threshold?: Interval;
}) {
  const { clipPrediction, onTagClick, threshold = DEFAULT_THRESHOLD } = props;

  const tags = useMemo(() => {
    const tags = clipPrediction.tags || [];
    return tags.filter(
      (tag) => tag.score >= threshold.min && tag.score <= threshold.max,
    );
  }, [clipPrediction.tags, threshold]);

  return (
    <div className="p-2">
      <H4 className="text-center">
        <TagsIcon className="inline-block w-4 h-4 mr-1" />
        Predicted Tags
      </H4>
      <div className="flex flex-col gap-1">
        {tags.map(({ tag }) => (
          <TagComponent
            key={getTagKey(tag)}
            tag={tag}
            onClick={() => onTagClick?.(tag)}
            count={null}
          />
        ))}
        {tags.length === 0 && (
          <Empty padding="p-2">No tags predicted for this clip</Empty>
        )}
      </div>
    </div>
  );
}
