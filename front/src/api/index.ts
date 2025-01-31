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
import { registerAuthAPI } from "./auth";
import { registerClipAnnotationsAPI } from "./clip_annotations";
import { registerClipAPI } from "./clips";
import { registerDatasetAPI } from "./datasets";
import { registerNotesAPI } from "./notes";
import { registerRecordingAPI } from "./recordings";
import { registerSoundEventAnnotationsAPI } from "./sound_event_annotations";
import { registerSoundEventAPI } from "./sound_events";
import { registerSpectrogramAPI } from "./spectrograms";
import { registerTagAPI } from "./tags";
import { registerUserAPI } from "./user";

type APIConfig = {
  baseURL: string;
  withCredentials: boolean;
};

/**
 * Create an instance of the Sonari API.
 */
export default function createAPI(config: APIConfig) {
  let instance = axios.create(config);
  return {
    annotationProjects: registerAnnotationProjectAPI(instance),
    soundEventAnnotations: registerSoundEventAnnotationsAPI(instance),
    clipAnnotations: registerClipAnnotationsAPI(instance),
    audio: registerAudioAPI(instance),
    auth: registerAuthAPI(instance),
    clips: registerClipAPI(instance),
    datasets: registerDatasetAPI(instance),
    notes: registerNotesAPI(instance),
    recordings: registerRecordingAPI(instance),
    soundEvents: registerSoundEventAPI(instance),
    spectrograms: registerSpectrogramAPI(instance),
    tags: registerTagAPI(instance),
    annotationTasks: registerAnnotationTasksAPI(instance),
    user: registerUserAPI(instance),
  } as const;
}
