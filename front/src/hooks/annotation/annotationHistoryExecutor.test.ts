import { describe, expect, it } from "vitest";

import {
  applyHistoryPatch,
  applyHistoryPatches,
  type HistoryExecutor,
} from "@/hooks/annotation/annotationHistoryExecutor";
import type { SoundEventAnnotation, Tag } from "@/types";

const sampleSea = (id: number): SoundEventAnnotation =>
  ({
    id,
    annotation_task_id: 1,
    recording_id: 1,
    geometry_type: "TimeInterval",
    geometry: { type: "TimeInterval", coordinates: [0, 1] },
    tags: [{ key: "species", value: "test" }],
  }) as SoundEventAnnotation;

function createRegistryExecutor(
  initial: { token: string; id: number; snapshot: SoundEventAnnotation }[],
  options?: {
    onCreate?: () => SoundEventAnnotation;
  },
): {
  executor: HistoryExecutor;
  registry: Map<string, { serverId: number; snapshot: SoundEventAnnotation }>;
  calls: {
    create: unknown[];
    delete: unknown[];
    update: unknown[];
    addTag: unknown[];
    removeTag: unknown[];
    addTaskTag: Tag[];
    removeTaskTag: Tag[];
  };
} {
  const registry = new Map(
    initial.map(({ token, id, snapshot }) => [
      token,
      { serverId: id, snapshot },
    ]),
  );
  let nextId = Math.max(0, ...initial.map((e) => e.id)) + 1;

  const calls = {
    create: [] as unknown[],
    delete: [] as unknown[],
    update: [] as unknown[],
    addTag: [] as unknown[],
    removeTag: [] as unknown[],
    addTaskTag: [] as Tag[],
    removeTaskTag: [] as Tag[],
  };

  const executor: HistoryExecutor = {
    createSoundEvent: async (params) => {
      calls.create.push(params);
      const created =
        options?.onCreate?.() ?? sampleSea(nextId++);
      return created;
    },
    deleteSoundEvent: async (annotation) => {
      calls.delete.push(annotation);
      return annotation;
    },
    updateSoundEvent: async (params) => {
      calls.update.push(params);
      return { ...params.soundEventAnnotation, geometry: params.geometry };
    },
    addSoundEventTag: async (params) => {
      calls.addTag.push(params);
      return params.soundEventAnnotation;
    },
    removeSoundEventTag: async (params) => {
      calls.removeTag.push(params);
      return params.soundEventAnnotation;
    },
    addTaskTag: async (tag) => {
      calls.addTaskTag.push(tag);
    },
    removeTaskTag: async (tag) => {
      calls.removeTaskTag.push(tag);
    },
    getServerId: (token) => registry.get(token)?.serverId,
    getSnapshot: (token) => registry.get(token)?.snapshot,
    setServerId: (token, id, snapshot) => {
      registry.set(token, { serverId: id, snapshot });
    },
  };

  return { executor, registry, calls };
}

describe("applyHistoryPatch", () => {
  it("createSoundEvent restores and returns replay event", async () => {
    const token = "t1";
    const { executor, registry, calls } = createRegistryExecutor([]);
    const snapshot = sampleSea(99);

    const event = await applyHistoryPatch(
      { type: "createSoundEvent", token, snapshot },
      executor,
    );

    expect(calls.create).toHaveLength(1);
    expect(event).toEqual({
      type: "restored",
      token,
      soundEvent: expect.objectContaining({ id: expect.any(Number) }),
    });
    expect(registry.get(token)?.serverId).toBeDefined();
  });

  it("deleteSoundEvent removes and returns removed event", async () => {
    const token = "t1";
    const sea = sampleSea(5);
    const { executor, calls } = createRegistryExecutor([
      { token, id: 5, snapshot: sea },
    ]);

    const event = await applyHistoryPatch(
      { type: "deleteSoundEvent", token, snapshot: sea },
      executor,
    );

    expect(calls.delete).toEqual([expect.objectContaining({ id: 5 })]);
    expect(event).toEqual({ type: "removed", token, serverId: 5 });
  });

  it("throws when sound event cannot be resolved for delete", async () => {
    const { executor } = createRegistryExecutor([]);

    await expect(
      applyHistoryPatch(
        {
          type: "deleteSoundEvent",
          token: "missing",
          snapshot: {
            geometry: { type: "TimeInterval", coordinates: [0, 1] },
            tags: [],
          } as SoundEventAnnotation,
        },
        executor,
      ),
    ).rejects.toThrow("Sound event is no longer available for undo.");
  });

  it("updateGeometry calls update with patch target geometry", async () => {
    const token = "t1";
    const sea = sampleSea(3);
    const { executor, calls, registry } = createRegistryExecutor([
      { token, id: 3, snapshot: sea },
    ]);
    const to = { type: "TimeInterval" as const, coordinates: [0, 5] };

    await applyHistoryPatch(
      { type: "updateGeometry", token, from: sea.geometry, to },
      executor,
    );

    expect(calls.update).toHaveLength(1);
    expect(registry.get(token)?.snapshot.geometry).toEqual(to);
  });

  it("addSoundEventTag and removeSoundEventTag invoke tag mutations", async () => {
    const token = "t1";
    const sea = sampleSea(2);
    const tag: Tag = { key: "species", value: "owl" };
    const { executor, calls } = createRegistryExecutor([
      { token, id: 2, snapshot: sea },
    ]);

    await applyHistoryPatch(
      { type: "addSoundEventTag", token, tag },
      executor,
    );
    await applyHistoryPatch(
      { type: "removeSoundEventTag", token, tag },
      executor,
    );

    expect(calls.addTag).toHaveLength(1);
    expect(calls.removeTag).toHaveLength(1);
  });

  it("addTaskTag and removeTaskTag invoke task tag mutations", async () => {
    const tag: Tag = { key: "habitat", value: "forest" };
    const { executor, calls } = createRegistryExecutor([]);

    await applyHistoryPatch({ type: "addTaskTag", tag }, executor);
    await applyHistoryPatch({ type: "removeTaskTag", tag }, executor);

    expect(calls.addTaskTag).toEqual([tag]);
    expect(calls.removeTaskTag).toEqual([tag]);
  });
});

describe("applyHistoryPatches", () => {
  it("collects only restore/remove replay events", async () => {
    const token = "t1";
    const sea = sampleSea(1);
    const { executor } = createRegistryExecutor([{ token, id: 1, snapshot: sea }]);

    const events = await applyHistoryPatches(
      [
        { type: "addTaskTag", tag: { key: "a", value: "1" } },
        { type: "deleteSoundEvent", token, snapshot: sea },
      ],
      executor,
    );

    expect(events).toEqual([{ type: "removed", token, serverId: 1 }]);
  });
});

describe("applyHistoryPatch id remap", () => {
  it("restores deleted sound events under a new server id on the same token", async () => {
    const token = "stable-token";
    let nextId = 5;
    const registry = new Map<
      string,
      { serverId: number; snapshot: SoundEventAnnotation }
    >();

    registry.set(token, { serverId: 5, snapshot: sampleSea(5) });

    const executor: HistoryExecutor = {
      createSoundEvent: async () => {
        nextId += 1;
        return sampleSea(nextId);
      },
      deleteSoundEvent: async (annotation) => annotation,
      updateSoundEvent: async ({ soundEventAnnotation, geometry }) => ({
        ...soundEventAnnotation,
        geometry,
      }),
      addSoundEventTag: async ({ soundEventAnnotation }) => soundEventAnnotation,
      removeSoundEventTag: async ({ soundEventAnnotation }) =>
        soundEventAnnotation,
      addTaskTag: async () => undefined,
      removeTaskTag: async () => undefined,
      getServerId: (t) => registry.get(t)?.serverId,
      getSnapshot: (t) => registry.get(t)?.snapshot,
      setServerId: (t, id, snapshot) => {
        registry.set(t, { serverId: id, snapshot });
      },
    };

    await applyHistoryPatch(
      { type: "deleteSoundEvent", token, snapshot: sampleSea(5) },
      executor,
    );
    expect(registry.get(token)?.serverId).toBe(5);

    await applyHistoryPatch(
      { type: "createSoundEvent", token, snapshot: sampleSea(5) },
      executor,
    );
    expect(registry.get(token)?.serverId).toBe(6);

    await applyHistoryPatches(
      [
        {
          type: "updateGeometry",
          token,
          from: { type: "TimeInterval", coordinates: [0, 1] },
          to: { type: "TimeInterval", coordinates: [0, 3] },
        },
      ],
      executor,
    );

    expect(registry.get(token)?.serverId).toBe(6);
    expect(registry.get(token)?.snapshot.geometry).toEqual({
      type: "TimeInterval",
      coordinates: [0, 3],
    });
  });
});
