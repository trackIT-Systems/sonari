"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import classNames from "classnames";
import {
  AcademicCapIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ArrowUpIcon,
  ArrowDownIcon,
} from "@heroicons/react/24/outline";

import type { GuidedTourLesson, GuidedTourStep } from "./types";
import { formatKeyLabel, matchesShortcut, tourTargetSelector } from "./manifest";
import { setGuidedTourLessonBlocking, subscribeGuidedTourEvents } from "./events";

const AUTO_ADVANCE_MS = 900;
/** An action step offers "Skip" after this long, so nobody gets stuck. */
const SKIP_AFTER_MS = 30_000;
const MARGIN = 16;
const MINIMIZED_KEY = "sonari.guidedTour.minimized";

export function guidedTourStorageKey(projectId: number, lessonId: string): string {
  return `sonari.guidedTour.${projectId}.${lessonId}`;
}

/** Forget saved step progress of every lesson in a tour project. */
export function clearGuidedTourProgress(projectId: number): void {
  try {
    const prefix = guidedTourStorageKey(projectId, "");
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(prefix)) window.localStorage.removeItem(key);
    }
  } catch {
    // Storage unavailable: nothing to clear.
  }
}

type Progress = { stepIndex: number; done: boolean[] };

function readStorage<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or blocked storage: progress just won't survive a reload.
  }
}

function loadProgress(storageKey: string, stepCount: number): Progress {
  const saved = readStorage<Progress>(storageKey);
  if (
    saved &&
    Array.isArray(saved.done) &&
    saved.done.length === stepCount &&
    saved.stepIndex >= 0 &&
    saved.stepIndex < stepCount
  ) {
    return saved;
  }
  return { stepIndex: 0, done: Array(stepCount).fill(false) };
}

function findVisibleTarget(target: string): HTMLElement | null {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>(tourTargetSelector(target)));
  return nodes.find((node) => node.getClientRects().length > 0) ?? null;
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function isBadgeStep(step: GuidedTourStep): boolean {
  return step.complete?.type === "event" && step.complete.event === "status-badge-added";
}

/** Whether every step of a lesson was completed (progress is read from storage). */
export function isLessonDone(projectId: number, lessonId: string): boolean {
  const saved = readStorage<Progress>(guidedTourStorageKey(projectId, lessonId));
  return Array.isArray(saved?.done) && saved.done.length > 0 && saved.done.every(Boolean);
}

/**
 * Keeps a ring drawn around the step's target element; never intercepts input.
 *
 * Re-measures on scroll and resize, when the element resizes, and on a slow
 * timer for layout shifts (content loading in). It does not poll every frame,
 * which would query the whole DOM 60 times a second on the busy annotate page.
 */
function useTargetRect(target: string | undefined): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!target) {
      setRect(null);
      return;
    }
    let el: HTMLElement | null = null;
    let observed: HTMLElement | null = null;
    let frame = 0;
    let last = "";

    const resizeObserver = new ResizeObserver(() => schedule());

    function measure() {
      frame = 0;
      if (el == null || !el.isConnected || el.getClientRects().length === 0) {
        el = findVisibleTarget(target!);
      }
      if (el !== observed) {
        if (observed) resizeObserver.unobserve(observed);
        if (el) resizeObserver.observe(el);
        observed = el;
      }
      const next = el?.getBoundingClientRect() ?? null;
      const sig = next ? `${next.x},${next.y},${next.width},${next.height}` : "";
      if (sig !== last) {
        last = sig;
        setRect(next);
      }
    }

    function schedule() {
      if (frame === 0) frame = requestAnimationFrame(measure);
    }

    measure();
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    const timer = window.setInterval(schedule, 500);
    return () => {
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      window.clearInterval(timer);
      resizeObserver.disconnect();
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [target]);

  return rect;
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex min-w-[1.75rem] items-center justify-center rounded-md border border-stone-300 bg-white px-1.5 py-0.5 font-mono text-xs font-semibold text-stone-700 shadow-[0_1px_0_0] shadow-stone-300 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:shadow-stone-600">
      {children}
    </kbd>
  );
}

/** Buttons must never take focus: the app ignores shortcuts while a button is focused. */
const noFocus = (e: React.MouseEvent) => e.preventDefault();

export default function GuidedTourCoach({
  lesson,
  projectId,
  storageKey,
  lessonNumber,
  lessonCount,
  onFinish,
  getUnfinishedLessons,
}: {
  lesson: GuidedTourLesson;
  /** Tour project id; used to look up the progress of other lessons. */
  projectId: number;
  /** Unique per user project + lesson; progress is restored from it. */
  storageKey: string;
  lessonNumber?: number;
  lessonCount?: number;
  /** Set on the tour's last lesson: shows a "Finish tour" button on its last step. */
  onFinish?: () => void;
  /** Titles of tour lessons that are not finished yet (checked on "Finish tour"). */
  getUnfinishedLessons?: () => string[];
}) {
  const [missingLessons, setMissingLessons] = useState<string[] | null>(null);
  const [tourComplete, setTourComplete] = useState(false);
  const stepCount = lesson.steps.length;
  const [progress, setProgress] = useState<Progress>(() => ({
    stepIndex: 0,
    done: Array(stepCount).fill(false),
  }));
  const [minimized, setMinimized] = useState(false);
  const [canSkip, setCanSkip] = useState(false);

  const progressRef = useRef(progress);
  /**
   * Step that was shown and still unfinished the last time we looked. Only a
   * step finishing while the user is on it may auto-advance; returning to an
   * already finished step (Back) or restoring one must not.
   */
  const pendingStep = useRef<number | null>(null);
  useEffect(() => {
    const saved = loadProgress(storageKey, stepCount);
    pendingStep.current = null;
    progressRef.current = saved;
    setProgress(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the parent remounts per lesson
  }, [storageKey, stepCount]);

  useEffect(() => {
    setMinimized(readStorage<boolean>(MINIMIZED_KEY) ?? false);
  }, []);

  const { stepIndex, done } = progress;
  const step = lesson.steps[stepIndex] ?? lesson.steps[0];
  const isLast = stepIndex === stepCount - 1;
  const stepDone = done[stepIndex] || step.complete == null;
  const completedCount = done.filter(Boolean).length;

  // Persist synchronously: the click that completes a step (e.g. "Back to
  // Annotate") often navigates away and unmounts this coach before React
  // would run a queued state updater, which used to lose the progress.
  const update = useCallback(
    (fn: (prev: Progress) => Progress) => {
      const next = fn(progressRef.current);
      if (next === progressRef.current) return;
      progressRef.current = next;
      writeStorage(storageKey, next);
      setProgress(next);
    },
    [storageKey],
  );

  const markDone = useCallback(
    (index: number) => {
      update((prev) => {
        if (prev.done[index]) return prev;
        const nextDone = [...prev.done];
        nextDone[index] = true;
        return { ...prev, done: nextDone };
      });
    },
    [update],
  );

  const goTo = useCallback(
    (index: number) => {
      pendingStep.current = null;
      update((prev) => {
        const nextDone = [...prev.done];
        // Leaving a read-only step forward counts as having read it.
        if (index > prev.stepIndex && lesson.steps[prev.stepIndex]?.complete == null) {
          nextDone[prev.stepIndex] = true;
        }
        return { stepIndex: Math.max(0, Math.min(stepCount - 1, index)), done: nextDone };
      });
    },
    [update, lesson.steps, stepCount],
  );

  // A read-only step counts as done as soon as it is shown. Otherwise a lesson
  // ending on one could never be completed.
  useEffect(() => {
    if (step.complete == null && !done[stepIndex]) markDone(stepIndex);
  }, [step, stepIndex, done, markDone]);

  // The app ignores shortcuts while a button has focus, and clicking a button
  // (status badge, tab, toolbar) focuses it. Drop that focus after the click,
  // unless the button belongs to an open dialog, menu or popover.
  useEffect(() => {
    const onClick = () => {
      window.setTimeout(() => {
        const el = document.activeElement;
        if (!(el instanceof HTMLButtonElement || el instanceof HTMLAnchorElement)) return;
        if (el.getAttribute("aria-expanded") === "true") return;
        if (el.closest('[role="dialog"], [role="menu"], [role="listbox"], [data-headlessui-state~="open"]')) {
          return;
        }
        el.blur();
      }, 0);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Status badges advance to the next lesson; hold them back until every
  // earlier step of this lesson is done.
  useEffect(() => {
    const open = lesson.steps.filter((s, i) => !isBadgeStep(s) && !done[i]);
    setGuidedTourLessonBlocking(open.length > 0, open.map((s) => s.task ?? s.title));
  }, [lesson.steps, done]);

  useEffect(() => () => setGuidedTourLessonBlocking(false), []);

  // Listen for the action that completes the current step.
  useEffect(() => {
    const completion = step.complete;
    if (!completion || done[stepIndex]) return;
    const finish = () => markDone(stepIndex);

    if (completion.type === "key") {
      const onKey = (e: KeyboardEvent) => {
        if (isTypingTarget(e.target)) return;
        if (completion.keys.some((k) => matchesShortcut(k, e))) finish();
      };
      // Capture phase: still counts if an app handler stops propagation.
      window.addEventListener("keydown", onKey, true);
      return () => window.removeEventListener("keydown", onKey, true);
    }

    if (completion.type === "event") {
      return subscribeGuidedTourEvents((event) => {
        if (event === completion.event) finish();
      });
    }

    if (completion.type === "lesson") {
      // The other lesson lives on another page, so this coach is remounted
      // when the user comes back; checking once on mount is enough.
      if (isLessonDone(projectId, completion.lesson)) finish();
      return;
    }

    const selector = tourTargetSelector(step.target);
    const onPointer = (e: PointerEvent) => {
      if (e.target instanceof Element && e.target.closest(selector)) finish();
    };
    document.addEventListener("pointerdown", onPointer, true);
    return () => document.removeEventListener("pointerdown", onPointer, true);
  }, [step, stepIndex, done, markDone, projectId]);

  // After an action completes a step, move on automatically.
  useEffect(() => {
    if (step.complete == null) return;
    if (!stepDone) {
      pendingStep.current = stepIndex;
      return;
    }
    const justCompleted = pendingStep.current === stepIndex;
    if (!justCompleted || isLast) return;
    const timer = window.setTimeout(() => {
      // Back may have been pressed during the delay.
      if (progressRef.current.stepIndex !== stepIndex) return;
      pendingStep.current = null;
      goTo(stepIndex + 1);
    }, AUTO_ADVANCE_MS);
    return () => window.clearTimeout(timer);
  }, [stepDone, step.complete, isLast, stepIndex, goTo]);

  useEffect(() => {
    setCanSkip(false);
    if (stepDone || isBadgeStep(step)) return;
    const timer = window.setTimeout(() => setCanSkip(true), SKIP_AFTER_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the step changes
  }, [storageKey, stepIndex]);

  // Bring the target into view when a step starts.
  useEffect(() => {
    const el = findVisibleTarget(step.target);
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [step.target, storageKey]);

  const targetRect = useTargetRect(minimized ? undefined : step.target);

  // Dock bottom-right, or bottom-left when that would cover the target.
  const cardRef = useRef<HTMLDivElement>(null);
  const [dockLeft, setDockLeft] = useState(false);
  // Side panels (spectrogram settings) open on the right and would hide the card.
  const [panelOpen, setPanelOpen] = useState(false);
  useEffect(() => {
    const check = () =>
      setPanelOpen(document.querySelector('[role="dialog"][data-headlessui-state~="open"]') != null);
    check();
    const timer = window.setInterval(check, 400);
    return () => window.clearInterval(timer);
  }, []);
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (panelOpen) {
      setDockLeft(true);
      return;
    }
    if (!card || !targetRect) {
      setDockLeft(false);
      return;
    }
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    const left = window.innerWidth - MARGIN - w;
    const top = window.innerHeight - MARGIN - h;
    const overlaps =
      targetRect.right > left &&
      targetRect.left < left + w &&
      targetRect.bottom > top &&
      targetRect.top < top + h;
    // Only move when the target is small enough to fit beside the card.
    setDockLeft(overlaps && targetRect.width < window.innerWidth - w - 2 * MARGIN);
  }, [targetRect, stepIndex, panelOpen]);

  const toggleMinimized = () => {
    setMinimized((prev) => {
      writeStorage(MINIMIZED_KEY, !prev);
      return !prev;
    });
  };

  const finishTour = () => {
    const missing = getUnfinishedLessons?.() ?? [];
    if (missing.length > 0) {
      setMissingLessons(missing);
      return;
    }
    setMissingLessons(null);
    setTourComplete(true);
  };

  // Target scrolled out of view: point towards it instead of a ring nobody sees.
  const offscreen =
    targetRect == null
      ? null
      : targetRect.bottom < 0
        ? "up"
        : targetRect.top > window.innerHeight
          ? "down"
          : null;

  const heading =
    lessonNumber != null && lessonCount != null
      ? `Lesson ${lessonNumber} of ${lessonCount} · ${lesson.title}`
      : lesson.title;

  return (
    <>
      {offscreen && (
        <button
          type="button"
          onMouseDown={noFocus}
          onClick={() =>
            findVisibleTarget(step.target)?.scrollIntoView({ behavior: "smooth", block: "center" })
          }
          className={classNames(
            "fixed left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-lg hover:bg-emerald-700",
            offscreen === "up" ? "top-16" : "bottom-4",
          )}
        >
          {offscreen === "up" ? <ArrowUpIcon className="h-4 w-4" /> : <ArrowDownIcon className="h-4 w-4" />}
          Show highlighted area
        </button>
      )}
      {targetRect && !offscreen && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[60] rounded-lg ring-4 ring-emerald-500/80 motion-safe:animate-pulse"
          style={{
            top: targetRect.top - 6,
            left: targetRect.left - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12,
          }}
        />
      )}
      <div
        ref={cardRef}
        role="region"
        aria-label="Guided tour"
        aria-live="polite"
        className={classNames(
          "fixed bottom-4 z-[61] w-[22rem] max-w-[calc(100vw-2rem)] rounded-xl border border-emerald-200 bg-white/95 shadow-xl backdrop-blur dark:border-emerald-800 dark:bg-stone-900/95",
          dockLeft ? "left-4" : "right-4",
        )}
      >
        <div className="flex items-center gap-2 border-b border-emerald-100 px-4 py-2 dark:border-emerald-900">
          <AcademicCapIcon className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-emerald-800 dark:text-emerald-300">
            {heading}
          </span>
          <span className="text-xs tabular-nums text-stone-500 dark:text-stone-400">
            {completedCount}/{stepCount}
          </span>
          <button
            type="button"
            onMouseDown={noFocus}
            onClick={toggleMinimized}
            className="rounded p-0.5 text-stone-500 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
            aria-label={minimized ? "Expand guided tour" : "Minimize guided tour"}
          >
            {minimized ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
          </button>
        </div>

        {!minimized && tourComplete && (
          <div className="flex flex-col gap-3 px-4 pb-4 pt-4">
            <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100">
              Tour complete 🎉
            </h3>
            <p className="text-sm leading-snug text-stone-600 dark:text-stone-300">
              You finished every lesson. Your annotation project is ready, so head back to the start
              page and open your own projects.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onMouseDown={noFocus}
                onClick={() => setTourComplete(false)}
                className="rounded-md px-2 py-1 text-sm text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                Stay here
              </button>
              <button
                type="button"
                onMouseDown={noFocus}
                onClick={onFinish}
                className="rounded-md bg-emerald-600 px-3 py-1 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Leave tour
              </button>
            </div>
          </div>
        )}

        {!minimized && !tourComplete && (
          <div className="flex flex-col gap-3 px-4 pb-3 pt-3">
            {missingLessons && (
              <div
                role="alert"
                className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
              >
                <p className="font-medium">Not quite done yet. Still open:</p>
                <ul className="mt-1 list-inside list-disc">
                  {missingLessons.map((title) => (
                    <li key={title}>{title}</li>
                  ))}
                </ul>
                <p className="mt-1 text-xs">Finish these lessons, then come back and finish the tour.</p>
              </div>
            )}
            <div className="flex gap-1" aria-hidden>
              {lesson.steps.map((_, i) => (
                <span
                  key={i}
                  className={classNames(
                    "h-1 flex-1 rounded-full transition-colors",
                    done[i]
                      ? "bg-emerald-500"
                      : i === stepIndex
                        ? "bg-emerald-300 dark:bg-emerald-700"
                        : "bg-stone-200 dark:bg-stone-700",
                  )}
                />
              ))}
            </div>

            <div>
              <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100">{step.title}</h3>
              {step.hint && (
                <p className="mt-1 text-sm leading-snug text-stone-600 dark:text-stone-300">{step.hint}</p>
              )}
              {step.keys?.length ? (
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {step.keys.map((k) => (
                    <Kbd key={k}>{formatKeyLabel(k)}</Kbd>
                  ))}
                </div>
              ) : null}
            </div>

            {step.complete && (
              <div
                className={classNames(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  stepDone
                    ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200"
                    : "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
                )}
              >
                {stepDone ? (
                  <CheckIcon className="h-4 w-4 shrink-0" />
                ) : (
                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75 motion-safe:animate-ping" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
                  </span>
                )}
                <span>{step.task ?? "Try it"}</span>
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onMouseDown={noFocus}
                onClick={() => goTo(stepIndex - 1)}
                disabled={stepIndex === 0}
                className="rounded-md px-2 py-1 text-sm text-stone-600 hover:bg-stone-100 disabled:invisible dark:text-stone-300 dark:hover:bg-stone-800"
              >
                Back
              </button>
              <div className="flex items-center gap-2">
                {canSkip && !stepDone && (
                  <button
                    type="button"
                    onMouseDown={noFocus}
                    onClick={() => {
                      markDone(stepIndex);
                      if (!isLast) goTo(stepIndex + 1);
                    }}
                    className="text-xs text-stone-500 underline-offset-2 hover:underline dark:text-stone-400"
                  >
                    Skip
                  </button>
                )}
                {!isLast && (
                  <button
                    type="button"
                    onMouseDown={noFocus}
                    onClick={() => goTo(stepIndex + 1)}
                    disabled={!stepDone}
                    title={stepDone ? undefined : "Complete the task above to continue"}
                    className="rounded-md bg-emerald-600 px-3 py-1 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500 dark:disabled:bg-stone-700 dark:disabled:text-stone-400"
                  >
                    Next
                  </button>
                )}
                {isLast && onFinish && (
                  <button
                    type="button"
                    onMouseDown={noFocus}
                    onClick={finishTour}
                    disabled={!stepDone}
                    className="rounded-md bg-emerald-600 px-3 py-1 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500 dark:disabled:bg-stone-700 dark:disabled:text-stone-400"
                  >
                    Finish tour
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
