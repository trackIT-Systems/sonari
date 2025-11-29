import Button from "@/components/Button";
import Search from "@/components/inputs/Search";
import TagComponent, { getTagKey } from "@/components/tags/Tag";
import useListWithSearch from "@/hooks/lists/useListWithSearch";

import type { Tag } from "@/types";

export default function TagList({
  tags = [],
  onClick,
  onRemove,
  showMax = 10,
  autoFocus,
}: {
  tags: Tag[];
  onClick?: (tag: Tag) => void;
  onRemove?: (tag: Tag) => void;
  showMax?: number;
  autoFocus?: boolean;
}) {
  const { items, setSearch, setLimit, hasMore } = useListWithSearch({
    options: tags || [],
    fields: ["key", "value"],
    limit: showMax,
  });
  return (
    <div className="flex flex-col gap-4">
      <Search autoFocus onChange={(value) => setSearch(value as string)} />
      <div className="flex overflow-hidden flex-col gap-2 w-full">
        {items.map((tag) => (
          <TagComponent
            key={getTagKey(tag)}
            tag={tag}
            onClick={onClick && (() => onClick(tag))}
            onClose={onRemove && (() => onRemove(tag))}
            count={null}
          />
        ))}
        {hasMore && (
          <Button
            mode="text"
            variant="primary"
            className="w-full"
            onClick={() => setLimit((limit) => limit + 10)}
          >
            Show more
          </Button>
        )}
      </div>
    </div>
  );
}
