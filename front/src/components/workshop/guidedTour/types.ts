import { z } from "zod";

import { GUIDED_TOUR_EVENTS } from "./events";

/** What the user must do before the step counts as done. Omit for read-only steps. */
export const guidedTourCompletionSchema = z.discriminatedUnion("type", [
  /** Press any of the listed keys (e.g. "ArrowLeft", "z", "Shift+h", "Space"). */
  z.object({ type: z.literal("key"), keys: z.array(z.string()).min(1) }),
  /** An app action reported via `emitGuidedTourEvent`. */
  z.object({ type: z.literal("event"), event: z.enum(GUIDED_TOUR_EVENTS) }),
  /** Click anywhere inside the step's target element. */
  z.object({ type: z.literal("click") }),
]);

export const guidedTourStepSchema = z.object({
  target: z.string(),
  title: z.string(),
  hint: z.string().optional(),
  keys: z.array(z.string()).optional(),
  /** Short imperative shown as a checklist item, e.g. "Press z". */
  task: z.string().optional(),
  complete: guidedTourCompletionSchema.optional(),
});

export const guidedTourLessonSchema = z.object({
  id: z.string(),
  title: z.string(),
  steps: z.array(guidedTourStepSchema).min(1),
});

export const guidedTourVariantManifestSchema = z.object({
  tasksTab: guidedTourLessonSchema,
  lessons: z.array(guidedTourLessonSchema),
});

export const guidedTourManifestSchema = z.object({
  bat: guidedTourVariantManifestSchema.optional(),
  bird: guidedTourVariantManifestSchema.optional(),
});

export type GuidedTourCompletion = z.infer<typeof guidedTourCompletionSchema>;
export type GuidedTourStep = z.infer<typeof guidedTourStepSchema>;
export type GuidedTourLesson = z.infer<typeof guidedTourLessonSchema>;
export type GuidedTourVariantManifest = z.infer<typeof guidedTourVariantManifestSchema>;
export type GuidedTourManifest = z.infer<typeof guidedTourManifestSchema>;

export type GuidedTourVariant = "bird" | "bat";
