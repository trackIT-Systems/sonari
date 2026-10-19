import { describe, expect, it } from "vitest";

import { buildAnnotationTaskFilterQueryParams } from "./annotation_tasks";

describe("buildAnnotationTaskFilterQueryParams", () => {
  it("sends ticked task ids as id__lst", () => {
    expect(buildAnnotationTaskFilterQueryParams({ annotation_task_ids: [3, 12, 7] }).id__lst).toBe("3,12,7");
  });

  it("omits id__lst without a selection", () => {
    expect(buildAnnotationTaskFilterQueryParams({}).id__lst).toBeUndefined();
    expect(buildAnnotationTaskFilterQueryParams({ annotation_task_ids: [] }).id__lst).toBeUndefined();
  });
});
