/** Runs at most `concurrency` loads at once; the rest wait in order. */
export type LoadQueue = {
  run<T>(load: () => Promise<T>, signal?: AbortSignal): Promise<T>;
};

function abortError(): Error {
  const error = new Error("Aborted while queued");
  error.name = "AbortError";
  return error;
}

/**
 * A queue for loads that should not all start at once, e.g. the tiles of a gallery:
 * the server renders them one after the other anyway, and the first ones then arrive
 * sooner. A load aborted while still waiting is dropped without starting.
 */
export function createLoadQueue(concurrency: number): LoadQueue {
  let running = 0;
  const waiting: (() => void)[] = [];

  const next = () => {
    running -= 1;
    waiting.shift()?.();
  };

  return {
    run(load, signal) {
      return new Promise((resolve, reject) => {
        const start = () => {
          if (signal?.aborted) {
            reject(abortError());
            // Hand the slot on
            running += 1;
            next();
            return;
          }
          running += 1;
          load().then(resolve, reject).finally(next);
        };
        if (running < concurrency) {
          start();
        } else {
          waiting.push(start);
          signal?.addEventListener(
            "abort",
            () => {
              const index = waiting.indexOf(start);
              if (index >= 0) {
                waiting.splice(index, 1);
                reject(abortError());
              }
            },
            { once: true },
          );
        }
      });
    },
  };
}
