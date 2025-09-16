import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/app/api";
import useFilter from "@/hooks/utils/useFilter";
import usePagedQuery from "@/hooks/utils/usePagedQuery";

import type {
  RecordingFilter,
  RecordingUpdate,
  RecordingPage,
} from "@/api/recordings";
import type { Recording, Tag } from "@/types";

const emptyFilter: RecordingFilter = {};
const _fixed: (keyof RecordingFilter)[] = [];

export default function useRecordings({
  filter: initialFilter = emptyFilter,
  fixed = _fixed,
  pageSize = 100,
  enabled = true,
}: {
  filter?: RecordingFilter;
  fixed?: (keyof RecordingFilter)[];
  pageSize?: number;
  enabled?: boolean;
} = {}) {
  const client = useQueryClient();
  const filter = useFilter<RecordingFilter>({
    defaults: initialFilter,
    fixed,
    persistKey: "filters:recordings",
  });

  const { items, total, pagination, query, queryKey } = usePagedQuery({
    name: "dataset_recordings",
    queryFn: api.recordings.getMany,
    pageSize: pageSize,
    filter: filter.filter,
    enabled,
  });

  const updater = useCallback(
    (
      updatedRecording: Recording,
      {
        index,
      }: {
        index: number;
      },
    ) => {
      client.setQueryData(queryKey, (old: RecordingPage) => {
        return {
          ...old,
          items: old.items.map((recording, other) => {
            if (other !== index) return recording;
            return updatedRecording;
          }),
        };
      });
    },
    [client, queryKey],
  );

  const deleter = useCallback(
    (
      _: Recording,
      {
        index,
      }: {
        index: number;
      },
    ) => {
      client.setQueryData(queryKey, (old: RecordingPage) => ({
        ...old,
        items: old.items.filter((_, other) => {
          return other !== index;
        }),
      }));
    },
    [client, queryKey],
  );

  const updateRecording = useMutation({
    mutationFn: async ({
      recording,
      data,
    }: {
      recording: Recording;
      data: RecordingUpdate;
      index: number;
    }) => await api.recordings.update(recording, data),
    onSuccess: updater,
  });

  const addTag = useMutation({
    mutationFn: async ({
      recording,
      tag,
    }: {
      recording: Recording;
      tag: Tag;
      index: number;
    }) => await api.recordings.addTag(recording, tag),
    onSuccess: updater,
  });

  const removeTag = useMutation({
    mutationFn: async ({
      recording,
      tag,
    }: {
      recording: Recording;
      tag: Tag;
      index: number;
    }) => await api.recordings.removeTag(recording, tag),
    onSuccess: updater,
  });

  const deleteRecording = useMutation({
    mutationFn: async ({
      recording,
    }: {
      recording: Recording;
      index: number;
    }) => await api.recordings.delete(recording),
    onSuccess: deleter,
  });

  return {
    ...query,
    items,
    total,
    pagination,
    filter,
    queryKey,
    updateRecording,
    addTag,
    removeTag,
    deleteRecording,
  };
}
