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
import { registerClipEvaluationAPI } from "./clip_evaluations";
import { registerClipPredictionsAPI } from "./clip_predictions";
import { registerClipAPI } from "./clips";
import { registerDatasetAPI } from "./datasets";
import { registerEvaluationSetAPI } from "./evaluation_sets";
import { registerEvaluationAPI } from "./evaluations";
import { registerModelRunAPI } from "./model_runs";
import { registerNotesAPI } from "./notes";
import { registerPluginsAPI } from "./plugins";
import { registerRecordingAPI } from "./recordings";
import { registerSoundEventAnnotationsAPI } from "./sound_event_annotations";
import { registerSoundEventEvaluationAPI } from "./sound_event_evaluations";
import { registerSoundEventPredictionsAPI } from "./sound_event_predictions";
import { registerSoundEventAPI } from "./sound_events";
import { registerSpectrogramAPI } from "./spectrograms";
import { registerTagAPI } from "./tags";
import { registerUserAPI } from "./user";
import { registerUserRunAPI } from "./user_runs";

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
    evaluationSets: registerEvaluationSetAPI(instance),
    notes: registerNotesAPI(instance),
    recordings: registerRecordingAPI(instance),
    soundEvents: registerSoundEventAPI(instance),
    spectrograms: registerSpectrogramAPI(instance),
    tags: registerTagAPI(instance),
    annotationTasks: registerAnnotationTasksAPI(instance),
    user: registerUserAPI(instance),
    plugins: registerPluginsAPI(instance),
    soundEventPredictions: registerSoundEventPredictionsAPI(instance),
    clipPredictions: registerClipPredictionsAPI(instance),
    modelRuns: registerModelRunAPI(instance),
    userRuns: registerUserRunAPI(instance),
    clipEvaluations: registerClipEvaluationAPI(instance),
    soundEventEvaluations: registerSoundEventEvaluationAPI(instance),
    evaluations: registerEvaluationAPI(instance),
  } as const;
}
