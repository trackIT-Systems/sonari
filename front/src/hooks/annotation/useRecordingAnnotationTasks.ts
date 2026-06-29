import { useMemo } from "react";

import useAnnotationTasks from "@/hooks/api/useAnnotationTasks";

export default function useRecordingAnnotationTasks({
  recordingId,
  enabled = true,
}: {
  recordingId: number | undefined;
  enabled?: boolean;
}) {
  const filter = useMemo(
    () => ({
      recording: recordingId != null ? { eq: recordingId } : undefined,
      include_annotation_project: true,
      include_sound_event_annotations: false,
      include_sound_event_tags: false,
      include_tags: false,
      include_notes: false,
      include_features: false,
      include_status_badges: false,
      include_status_badge_users: false,
    }),
    [recordingId],
  );

  const { items, isLoading, isError } = useAnnotationTasks({
    filter,
    pageSize: -1,
    enabled: enabled && recordingId != null,
  });

  return {
    tasks: items,
    isLoading,
    isError,
  } as const;
}
