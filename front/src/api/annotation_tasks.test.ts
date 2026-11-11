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

  it("sends task tags apart from sound event tags", () => {
    const params = buildAnnotationTaskFilterQueryParams({
      sound_event_annotation_tag: [{ key: "species", value: "Ppip" }],
      task_tag: [
        { key: "quality", value: "good" },
        { key: "quality", value: "rain", exclude: true },
      ],
      task_tag_include_match: "and",
      task_tag_count: { eq: 1 },
    });
    expect(params.sound_event_annotation_tag__values).toBe("Ppip");
    expect(params.task_tag__keys).toBe("quality");
    expect(params.task_tag__values).toBe("good");
    expect(params.task_tag__exclude_values).toBe("rain");
    expect(params.task_tag__include_match).toBe("and");
    expect(params.task_tag_count__eq).toBe(1);
  });
});
