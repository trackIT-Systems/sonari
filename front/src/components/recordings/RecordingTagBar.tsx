import useStore from "@/store";
import { type Tag as TagType, type Recording } from "@/api/schemas";
import { TagIcon } from "@/components/icons";
import Tag from "@/components/tags/Tag";
import AddTagButton from "@/components/tags/AddTagButton";
import useRecording from "@/hooks/api/useRecording";

export default function RecordingTagBar({
  recording: data,
}: {
  recording: Recording;
}) {
  const getTagColor = useStore((state) => state.getTagColor);
  const recording = useRecording({
    uuid: data.uuid,
    recording: data,
  });

  return (
    <div className="flex flex-row gap-2 items-center">
      <div className="inline-flex">
        <TagIcon className="inline-block mr-1 w-5 h-5 text-stone-500" />
        <span className="text-sm text-stone-400 dark:text-stone-600">
          Tags:
        </span>
      </div>
      <div className="flex flex-row flex-wrap gap-2">
        {data.tags?.map((tag: TagType) => (
          <Tag
            key={`${tag.key}-${tag.value}`}
            tag={tag}
            {...getTagColor(tag)}
          />
        ))}
        <AddTagButton variant="primary" onAdd={recording.addTag.mutate} />
      </div>
    </div>
  );
}
