import { RecordingIcon } from "@/components/icons";
import Link from "@/components/Link";
import RecordingDate from "@/components/recordings/RecordingDate";
import {
  getBaseName,
  removeExtension,
} from "@/components/recordings/RecordingHeader";
import RecordingLocation from "@/components/recordings/RecordingLocation";
import RecordingTagBar from "@/components/recordings/RecordingTagBar";
import RecordingTime from "@/components/recordings/RecordingTime";
import useRecording from "@/hooks/api/useRecording";

import type { Recording, Tag } from "@/types";

export default function RecordingAnnotationContext({
  recording,
  onTagClick,
}: {
  recording: Recording;
  onTagClick?: (tag: Tag) => void;
}) {
  const { path } = recording;
  const baseName = getBaseName(path) ?? "";

  const { downloadURL }  = useRecording({
    uuid: recording.uuid,
    recording,
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-row justify-start gap-8 items-center">
        <div className="inline-flex items-center text-stone-500">
          <RecordingIcon className="inline-block mr-1 w-5 h-5 text-stone-600" />
          <Link
            mode="text"
            padding="p-0"
            variant="secondary"
            href={downloadURL || ""}
            className="max-w-xl whitespace-nowrap"
            target="_blank"
            download
          >
            {baseName}
          </Link>
        </div>
        <RecordingLocation
          latitude={recording.latitude}
          longitude={recording.longitude}
          disabled
        />
        <RecordingTime time={recording.time} disabled />
        <RecordingDate date={recording.date} disabled />
        <div className="text-stone-500 text-sm">
          <span className="font-semibold">SR</span>{" "}
          {recording.samplerate.toLocaleString()} Hz
        </div>
        <div className="text-stone-500 text-sm">
          <span className="font-semibold">C</span>{" "}
          {recording.channels.toLocaleString()}
        </div>
        <div className="text-stone-500 text-sm">
          <span className="font-semibold">TE</span>{" "}
          {recording.time_expansion.toLocaleString()}
        </div>
      </div>
    </div>
  );
}
