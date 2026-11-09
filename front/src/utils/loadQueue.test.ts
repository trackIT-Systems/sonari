import { describe, expect, it } from "vitest";

import { createLoadQueue } from "@/utils/loadQueue";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe("createLoadQueue", () => {
  it("runs at most `concurrency` loads at once, in order", async () => {
    const queue = createLoadQueue(2);
    const started: number[] = [];
    const gates = [deferred(), deferred(), deferred()];
    const runs = gates.map((gate, i) =>
      queue.run(async () => {
        started.push(i);
        await gate.promise;
        return i;
      }),
    );
    await Promise.resolve();
    expect(started).toEqual([0, 1]);
    gates[0].resolve();
    await runs[0];
    await Promise.resolve();
    expect(started).toEqual([0, 1, 2]);
    gates[1].resolve();
    gates[2].resolve();
    expect(await Promise.all(runs)).toEqual([0, 1, 2]);
  });

  it("drops a load aborted while waiting", async () => {
    const queue = createLoadQueue(1);
    const gate = deferred();
    const first = queue.run(() => gate.promise);
    const controller = new AbortController();
    let started = false;
    const second = queue.run(async () => {
      started = true;
    }, controller.signal);
    controller.abort();
    await expect(second).rejects.toThrow("Aborted");
    gate.resolve();
    await first;
    expect(started).toBe(false);
    // The slot is free again
    await expect(queue.run(async () => 5)).resolves.toBe(5);
  });
});
