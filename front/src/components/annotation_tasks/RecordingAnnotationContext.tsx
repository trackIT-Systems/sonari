import { memo } from "react";

import AnnotationTaskSourceSelector from "@/components/annotation_tasks/AnnotationTaskSourceSelector";
import { RecordingIcon } from "@/components/icons";
import RecordingDate from "@/components/recordings/RecordingDate";
import RecordingLocation from "@/components/recordings/RecordingLocation";
import RecordingTime from "@/components/recordings/RecordingTime";
import Tooltip from "@/components/Tooltip";
import useRecording from "@/hooks/api/useRecording";

import type { AnnotationTask, Recording } from "@/types";

function truncateFilename(name: string, maxLength = 70): string {
  if (name.length <= maxLength) {
    return name;
  }
  return `${name.slice(0, maxLength - 1)}…`;
}

const RecordingAnnotationContext = memo(function RecordingAnnotationContext({
  recording,
  currentTaskIndex,
  totalTasks,
  currentTaskId,
  annotationTaskSources,
  sourceTaskId,
  onSourceTaskChange,
}: {
  recording: Recording;
  currentTaskIndex?: number;
  totalTasks?: number;
  currentTaskId?: number;
  annotationTaskSources?: AnnotationTask[];
  sourceTaskId?: number | null;
  onSourceTaskChange?: (sourceTaskId: number | null) => void;
}) {
  const { path } = recording;
  const baseName = path.split("\\").pop()?.split("/").pop() ?? "";
  const displayName = truncateFilename(baseName);
  const isTruncated = baseName !== displayName;

  const { downloadURL } = useRecording({
    id: recording.id,
    recording,
  });

  const filenameLink = (
    <a
      className="focus:ring-4 focus:ring-emerald-500/50 focus:outline-none text-stone-500 stroke-stone-500 hover:stroke-stone-800 dark:hover:stroke-stone-300 disabled:stroke-stone-500 dark:disabled:stroke-stone-500 p-0 font-medium bg-transparent hover:underline hover:decoration-solid hover:decoration-2 hover:underline-offset-2 hover:font-extrabold disabled:no-underline disabled:font-medium stroke-2 hover:stroke-4 disabled:stroke-1 group flex min-w-0 max-w-[70ch] flex-row items-center truncate rounded-lg text-center text-sm"
      href={downloadURL || ""}
      target="_blank"
      download
    >
      {displayName}
    </a>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-w-0 flex-row flex-wrap items-center justify-start gap-4">
        <div className="inline-flex min-w-0 shrink items-center text-stone-500">
          <RecordingIcon className="inline-block mr-1 w-5 h-5 shrink-0 text-stone-600" />
          {isTruncated ? (
            <Tooltip tooltip={baseName} placement="bottom-start" portal>
              {filenameLink}
            </Tooltip>
          ) : (
            filenameLink
          )}
          {currentTaskIndex != null && totalTasks != null && (
            <span className="ml-2 shrink-0 text-stone-500 text-sm">
              ({currentTaskIndex}/{totalTasks})
            </span>
          )}
        </div>
        {currentTaskId != null &&
          annotationTaskSources != null &&
          onSourceTaskChange != null && (
            <AnnotationTaskSourceSelector
              currentTaskId={currentTaskId}
              annotationTaskSources={annotationTaskSources}
              sourceTaskId={sourceTaskId ?? null}
              onSourceTaskChange={onSourceTaskChange}
            />
          )}
        <RecordingDate date={recording.date} disabled />
        <RecordingTime time={recording.time} disabled />
        <RecordingLocation
          latitude={recording.latitude}
          longitude={recording.longitude}
          disabled
        />
        <div className="shrink-0 text-stone-500 text-sm">
          {recording.samplerate.toLocaleString()} Hz
        </div>
        <div className="shrink-0 text-stone-500 text-sm">
          {recording.channels.toLocaleString()}
        </div>
      </div>
    </div>
  );
});

export default RecordingAnnotationContext;
