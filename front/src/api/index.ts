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
    audio: registerAudioAPI(instance),
    auth: registerAuthAPI(instance),
    datasets: registerDatasetAPI(instance),
    export: registerExportAPI(instance),
    notes: registerNotesAPI(instance),
    psd: registerPsdAPI(instance),
    recordings: registerRecordingAPI(instance),
    spectrograms: registerSpectrogramAPI(instance),
    waveforms: registerWaveformsAPI(instance),
    tags: registerTagAPI(instance),
    annotationTasks: registerAnnotationTasksAPI(instance),
    user: registerUserAPI(instance),
  } as const;
}
