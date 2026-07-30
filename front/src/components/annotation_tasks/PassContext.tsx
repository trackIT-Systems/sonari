import Button from "@/components/Button";
import { H4 } from "@/components/Headings";
import { PreviousIcon, NextIcon } from "@/components/icons";
import {
  formatPassLabel,
  getPassContext,
} from "@/utils/passes";

import type { SoundEventAnnotation } from "@/types";

function getEventStartTime(annotation: SoundEventAnnotation): number {
  const { geometry } = annotation;
  if (geometry.type === "BoundingBox") {
    return geometry.coordinates[0];
  }
  if (geometry.type === "TimeInterval") {
    return geometry.coordinates[0];
  }
  return 0;
}

export default function PassContext({
  soundEventAnnotation,
  allSoundEventAnnotations,
  onSelectSoundEventAnnotation,
}: {
  soundEventAnnotation: SoundEventAnnotation;
  allSoundEventAnnotations: SoundEventAnnotation[];
  onSelectSoundEventAnnotation?: (annotation: SoundEventAnnotation) => void;
}) {
  const passContext = getPassContext(
    soundEventAnnotation,
    allSoundEventAnnotations,
  );

  if (passContext == null) {
    return null;
  }

  const { passTag, events, index, total } = passContext;
  const previousEvent = index > 0 ? events[index - 1] : null;
  const nextEvent = index < total - 1 ? events[index + 1] : null;

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-md border border-stone-200 p-3 dark:border-stone-600">
      <H4 className="text-center leading-tight">
        Pass {formatPassLabel(passTag)}
      </H4>
      <div className="text-center text-sm text-stone-600 dark:text-stone-300">
        Event {index + 1} of {total}
      </div>
      <div className="flex flex-wrap justify-center gap-1 text-xs text-stone-500 dark:text-stone-400">
        {events.map((event, eventIndex) => (
          <button
            key={event.id}
            type="button"
            className={
              event.id === soundEventAnnotation.id
                ? "rounded border border-stone-400 bg-stone-200 px-2 py-0.5 font-semibold text-stone-900 dark:border-stone-500 dark:bg-stone-700 dark:text-stone-100"
                : "rounded border border-stone-300 px-2 py-0.5 hover:border-stone-400 dark:border-stone-600"
            }
            onClick={() => onSelectSoundEventAnnotation?.(event)}
          >
            {eventIndex + 1} ({getEventStartTime(event).toFixed(2)}s)
          </button>
        ))}
      </div>
      <div className="flex justify-center gap-2">
        <Button
          mode="text"
          variant="info"
          disabled={previousEvent == null}
          onClick={() => previousEvent && onSelectSoundEventAnnotation?.(previousEvent)}
        >
          <PreviousIcon className="inline-block h-4 w-4" />
          Previous in pass
        </Button>
        <Button
          mode="text"
          variant="info"
          disabled={nextEvent == null}
          onClick={() => nextEvent && onSelectSoundEventAnnotation?.(nextEvent)}
        >
          Next in pass
          <NextIcon className="inline-block h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
