import { useEffect, useState } from "react";

import Tooltip from "@/components/Tooltip";
import TagComponent, { type TagCount, getTagKey } from "@/components/tags/Tag";

function useTableTagVisibleLimit() {
  const [limit, setLimit] = useState(2);

  useEffect(() => {
    const mqSm = window.matchMedia("(min-width: 640px)");
    const mqLg = window.matchMedia("(min-width: 1024px)");

    const update = () => {
      if (mqLg.matches) {
        setLimit(5);
      } else if (mqSm.matches) {
        setLimit(3);
      } else {
        setLimit(2);
      }
    };

    update();
    mqSm.addEventListener("change", update);
    mqLg.addEventListener("change", update);
    return () => {
      mqSm.removeEventListener("change", update);
      mqLg.removeEventListener("change", update);
    };
  }, []);

  return limit;
}

/**
 * Compact tag list for table cells: limits visible chips and shows the rest in a hover tooltip.
 */
export default function TableTagList({ tagCounts }: { tagCounts: TagCount[] }) {
  const maxVisible = useTableTagVisibleLimit();

  if (tagCounts.length === 0) {
    return null;
  }

  const visible = tagCounts.slice(0, maxVisible);
  const hiddenCount = tagCounts.length - visible.length;

  const tooltip = (
    <div className="flex max-w-sm flex-wrap gap-1 p-1">
      {tagCounts.map(({ tag, count }) => (
        <TagComponent key={getTagKey(tag)} tag={tag} count={count} />
      ))}
    </div>
  );

  return (
    <Tooltip tooltip={tooltip} interactive portal placement="bottom-start">
      <div
        className="flex min-w-0 max-w-full flex-wrap items-center gap-0.5 p-0.5"
        tabIndex={0}
      >
        {visible.map(({ tag, count }) => (
          <TagComponent key={getTagKey(tag)} tag={tag} count={count} compact />
        ))}
        {hiddenCount > 0 && (
          <span className="shrink-0 rounded-md border border-stone-300 bg-stone-100 px-1.5 py-0.5 text-xs tabular-nums text-stone-600 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300">
            +{hiddenCount}
          </span>
        )}
      </div>
    </Tooltip>
  );
}
