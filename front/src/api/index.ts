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
import { registerClipAnnotationsAPI } from "./clip_annotations";
import { registerClipAPI } from "./clips";
import { registerDatasetAPI } from "./datasets";
import { registerNotesAPI } from "./notes";
import { registerRecordingAPI } from "./recordings";
import { registerSoundEventAnnotationsAPI } from "./sound_event_annotations";
import { registerSoundEventAPI } from "./sound_events";
import { registerSpectrogramAPI } from "./spectrograms";
import { registerTagAPI } from "./tags";

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
  const clipAnnotationsAPI = registerClipAnnotationsAPI(instance);
  const clipAPI = registerClipAPI(instance);
  const datasetAPI = registerDatasetAPI(instance);
  const notesAPI = registerNotesAPI(instance);
  const recordingAPI = registerRecordingAPI(instance);
  const soundEventAnnotationsAPI = registerSoundEventAnnotationsAPI(instance);
  const soundEventAPI = registerSoundEventAPI(instance);
  const spectrogramAPI = registerSpectrogramAPI(instance);
  const tagAPI = registerTagAPI(instance);

  return {
    annotationProjects: annotationProjectAPI,
    annotationTasks: annotationTasksAPI,
    audio: audioAPI,
    auth: authAPI,
    clipAnnotations: clipAnnotationsAPI,
    clips: clipAPI,
    datasets: datasetAPI,
    notes: notesAPI,
    recordings: recordingAPI,
    soundEventAnnotations: soundEventAnnotationsAPI,
    soundEvents: soundEventAPI,
    spectrograms: spectrogramAPI,
    tags: tagAPI,
  } as const;
} 