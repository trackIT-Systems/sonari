"use client";
import { notFound, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useContext } from "react";
import toast from "react-hot-toast";

import UserContext from "@/app/(base)/context";
import Loading from "@/app/loading";
import RecordingDetail from "@/components/recordings/RecordingDetail";
import useRecording from "@/hooks/api/useRecording";
import useStore from "@/store";

import type { SpectrogramParameters } from "@/types";
import type { AxiosError } from "axios";

export default function Page() {
  const user = useContext(UserContext);
  const router = useRouter();
  const searchParams = useSearchParams();
  const recordingUUID = searchParams?.get("recording_uuid");
  const datasetUUID = searchParams?.get("dataset_uuid");
  const parameters = useStore((state) => state.spectrogramSettings);
  const setParameters = useStore((state) => state.setSpectrogramSettings);

  const returnToRecordings = useCallback(() => {
    if (datasetUUID == null) router.push("/datasets/");
    router.push(`/datasets/detail/recordings/?dataset_uuid=${datasetUUID}`);
  }, [router, datasetUUID]);

  const handleError = useCallback(
    (error: AxiosError) => {
      if (error.response?.status === 404) {
        toast.error("Recording not found");
        returnToRecordings();
      }
    },
    [returnToRecordings],
  );

  const onParametersSave = useCallback(
    (parameters: SpectrogramParameters) => {
      toast.success("Parameters saved");
      setParameters(parameters);
    },
    [setParameters],
  );

  const onDelete = useCallback(() => {
    toast.success("Recording deleted");
    returnToRecordings();
  }, [returnToRecordings]);

  if (recordingUUID == null) {
    notFound();
  }

  const recording = useRecording({
    uuid: recordingUUID,
    onError: handleError,
  });

  if (recording.isLoading) {
    return <Loading />;
  }

  if (recording.isError || recording.data == null) {
    // @ts-ignore
    return handleError(recording.error);
  }

  return (
    <RecordingDetail
      recording={recording.data}
      currentUser={user}
      onDelete={onDelete}
      parameters={parameters}
      onParameterSave={onParametersSave}
    />
  );
}
