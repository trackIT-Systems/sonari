/**
 * Sonari Javascript API
 *
 * This file is the entry point for the Sonari Javascript API.
 * Use the API to interact with the Sonari backend.
 */
import axios from "axios";

import { registerAnnotationProjectAPI } from "./annotation_projects";
import { registerAnnotationTasksAPI } from "./annotation_tasks";
import { registerAudioAPI } from "./audio";
import { registerAuthAPI, setupAuthInterceptor } from "./auth";
import { registerDatasetAPI } from "./datasets";
import { registerExportAPI } from "./export";
import { registerNotesAPI } from "./notes";
import { registerPsdAPI } from "./psd";
import { registerRecordingAPI } from "./recordings";
import { registerSoundEventAnnotationsAPI } from "./sound_event_annotations";
import { registerSpectrogramAPI } from "./spectrograms";
import { registerTagAPI } from "./tags";
import { registerUserAPI } from "./user";
import { registerWaveformsAPI } from "./waveforms";

type APIConfig = {
  baseURL: string;
  withCredentials?: boolean;
};

/**
 * Create an instance of the Sonari API.
 */
export default function createAPI(config: APIConfig) {
  const { baseURL, withCredentials = true } = config;

  const instance = axios.create({
    baseURL,
    withCredentials,
  });

  setupAuthInterceptor(instance);

  const annotationProjectAPI = registerAnnotationProjectAPI(instance);
  const annotationTasksAPI = registerAnnotationTasksAPI(instance);
  const audioAPI = registerAudioAPI(instance);
  const authAPI = registerAuthAPI(instance)
  const datasetAPI = registerDatasetAPI(instance);
  const notesAPI = registerNotesAPI(instance);
  const recordingAPI = registerRecordingAPI(instance);
  const soundEventAnnotationsAPI = registerSoundEventAnnotationsAPI(instance);
  const spectrogramAPI = registerSpectrogramAPI(instance);
  const tagAPI = registerTagAPI(instance);
  const waveformAPI = registerWaveformsAPI(instance);
  const exportAPI = registerExportAPI(instance);
  const psdAPI = registerPsdAPI(instance);

  return {
    annotationProjects: annotationProjectAPI,
    annotationTasks: annotationTasksAPI,
    audio: audioAPI,
    auth: authAPI,
    datasets: datasetAPI,
    notes: notesAPI,
    recordings: recordingAPI,
    soundEventAnnotations: soundEventAnnotationsAPI,
    spectrograms: spectrogramAPI,
    tags: tagAPI,
    waveforms: waveformAPI,
    export: exportAPI,
    psd: psdAPI
  } as const;
} 