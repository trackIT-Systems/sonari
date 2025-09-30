import { RecordingIcon } from "@/components/icons";
import Link from "@/components/Link";
import RecordingDate from "@/components/recordings/RecordingDate";
import {
  getBaseName,
} from "@/components/recordings/RecordingHeader";
import RecordingLocation from "@/components/recordings/RecordingLocation";
import RecordingTime from "@/components/recordings/RecordingTime";
import useRecording from "@/hooks/api/useRecording";

import type { Clip, Recording } from "@/types";

export default function RecordingAnnotationContext({
  recording,
  clip,
  currentClipIndex,
  totalClips,
}: {
  recording: Recording;
  clip?: Clip;
  currentClipIndex?: number;
  totalClips?: number;
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
          <a
            className="focus:ring-4 focus:ring-emerald-500/50 focus:outline-none text-stone-500 stroke-stone-500 hover:stroke-stone-800 dark:hover:stroke-stone-300 disabled:stroke-stone-500 dark:disabled:stroke-stone-500 p-0 font-medium bg-transparent hover:underline hover:decoration-solid hover:decoration-2 hover:underline-offset-2 hover:font-extrabold disabled:no-underline disabled:font-medium stroke-2 hover:stroke-4 disabled:stroke-1 group flex flex-row items-center rounded-lg text-center text-sm max-w-xl whitespace-nowrap"
            href={downloadURL || ""}
            target="_blank"
            download
          >
            {baseName}
          </a>
          {clip && currentClipIndex != null && totalClips != null && (
            <span className="ml-2 text-stone-500 text-sm">
              ({currentClipIndex}/{totalClips})
            </span>
          )}
        </div>
        <RecordingDate date={recording.date} disabled />
        <RecordingTime time={recording.time} disabled />
        <RecordingLocation
          latitude={recording.latitude}
          longitude={recording.longitude}
          disabled
        />
        <div className="text-stone-500 text-sm">
          {recording.samplerate.toLocaleString()} Hz
        </div>
        <div className="text-stone-500 text-sm">
          {recording.channels.toLocaleString()}
        </div>
      </div>
    </div>
  );
}
