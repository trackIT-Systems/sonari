"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

import api from "@/app/api";
import Card from "@/components/Card";
import Link from "@/components/Link";
import Button from "@/components/Button";
import Dialog from "@/components/Dialog";
import { clearGuidedTourProgress } from "@/components/workshop/guidedTour/GuidedTourCoach";
import { clearAnnotationTaskFilterPersist } from "@/hooks/utils/annotationTaskFilterPersistKey";

import type { GuidedTourProgress, GuidedTourVariant } from "@/api/annotation_projects";

const VARIANT_LABELS: Record<GuidedTourVariant, string> = {
  bird: "Bird tour",
  bat: "Bat tour",
};

export default function Page() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [availableVariants, setAvailableVariants] = useState<GuidedTourVariant[]>(
    [],
  );
  const [loadingVariants, setLoadingVariants] = useState(true);
  const [tours, setTours] = useState<GuidedTourProgress[]>([]);
  const [tourLoading, setTourLoading] = useState<GuidedTourVariant | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { variants, tours } = await api.annotationProjects.getGuidedTourAvailable();
        if (!cancelled) {
          setAvailableVariants(variants);
          setTours(tours);
        }
      } catch {
        if (!cancelled) {
          setAvailableVariants([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingVariants(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const startGuidedTour = useCallback(
    async (variant: GuidedTourVariant, { reset = false }: { reset?: boolean } = {}) => {
      setTourLoading(variant);
      try {
        const result = await api.annotationProjects.ensureGuidedTour({ variant, reset });
        clearAnnotationTaskFilterPersist(result.annotation_project_id);
        // A reset recreates every task with new ids, but the cached task lists
        // keep their keys (same project). Drop them, or the annotate page would
        // open on a stale list that does not contain the new tasks.
        queryClient.removeQueries({
          predicate: (query) =>
            typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith("annotation_task"),
        });
        if (reset) {
          clearGuidedTourProgress(result.annotation_project_id);
        }
        const taskId = reset
          ? result.first_annotation_task_id
          : (result.resume_annotation_task_id ?? result.first_annotation_task_id);
        if (taskId == null) {
          toast.error("Guided tour has no tasks yet.");
          return;
        }
        router.push(
          `/annotation_projects/detail/annotation/?annotation_project_id=${result.annotation_project_id}&annotation_task_id=${taskId}`,
        );
      } catch (error: unknown) {
        const message =
          error && typeof error === "object" && "message" in error
            ? String((error as Error).message)
            : "Could not start the guided tour.";
        toast.error(message);
      } finally {
        setTourLoading(null);
      }
    },
    [router, queryClient],
  );

  const showGuidedTourCard =
    loadingVariants || availableVariants.length > 0;

  return (
    <div className="container mx-auto p-16">
      <div className="flex flex-col gap-4">
        <h1 className="text-center text-7xl">
          <span className="text-6xl font-thin">Welcome to</span>
          <span className="pl-4 text-emerald-500 decoration-8">Sonari</span>
        </h1>
      </div>
      <div className="pt-16">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3 lg:grid-cols-3">
          {showGuidedTourCard ? (
            <Card className="justify-between p-6">
              <h2 className="mb-4 text-2xl font-bold">Guided user tour</h2>
              <p className="mb-4 text-sm">
                New to Sonari? Start a personal practice project with step-by-step
                instructions. It is not listed under Annotation Projects.
              </p>
              {loadingVariants ? (
                <p className="text-sm text-gray-500">Loading tours…</p>
              ) : (
                <div className="flex flex-col gap-4">
                  {availableVariants.map((variant) => {
                    const tour = tours.find((t) => t.variant === variant);
                    const busy = tourLoading !== null;
                    if (tour == null) {
                      return (
                        <Button
                          key={variant}
                          type="button"
                          variant="primary"
                          disabled={busy}
                          onClick={() => void startGuidedTour(variant)}
                        >
                          {tourLoading === variant
                            ? "Preparing…"
                            : `Start ${VARIANT_LABELS[variant]}`}
                        </Button>
                      );
                    }
                    const finished = tour.total_tasks > 0 && tour.done_tasks >= tour.total_tasks;
                    return (
                      <div key={variant} className="flex flex-col gap-2">
                        <div className="flex items-baseline justify-between text-sm">
                          <span className="font-semibold">{VARIANT_LABELS[variant]}</span>
                          <span className="tabular-nums text-stone-500 dark:text-stone-400">
                            {finished
                              ? "Completed"
                              : `${tour.done_tasks} of ${tour.total_tasks} lessons done`}
                          </span>
                        </div>
                        <div
                          className="h-1.5 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700"
                          aria-hidden
                        >
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{
                              width: `${tour.total_tasks ? (100 * tour.done_tasks) / tour.total_tasks : 0}%`,
                            }}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="primary"
                            className="flex-1"
                            disabled={busy}
                            onClick={() => void startGuidedTour(variant)}
                          >
                            {tourLoading === variant ? "Preparing…" : "Keep going"}
                          </Button>
                          <Dialog
                            label="Start from scratch"
                            title="Start from scratch?"
                            variant="secondary"
                            disabled={busy}
                          >
                            {({ close }) => (
                              <div className="flex flex-col gap-4">
                                <p className="text-sm">
                                  This restores the {VARIANT_LABELS[variant].toLowerCase()} to
                                  its original state. Your badges, tags, and created or deleted
                                  sound events in it are discarded.
                                </p>
                                <div className="flex justify-end gap-2">
                                  <Button type="button" variant="secondary" onClick={close}>
                                    Cancel
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="danger"
                                    onClick={() => {
                                      close();
                                      void startGuidedTour(variant, { reset: true });
                                    }}
                                  >
                                    Start from scratch
                                  </Button>
                                </div>
                              </div>
                            )}
                          </Dialog>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          ) : null}
          <Card className="justify-between p-6">
            <h2 className="mb-4 text-2xl font-bold">Annotate</h2>
            <p className="mb-4 text-sm">Annotate audio recordings.</p>
            <Link
              mode="text"
              href="/annotation_projects/"
              className="text-sm font-bold underline"
            >
              Annotate
            </Link>
          </Card>
          <Card className="justify-between p-6">
            <h2 className="mb-4 text-2xl font-bold">Export</h2>
            <p className="mb-4 text-sm">Export your annotations.</p>
            <Link
              mode="text"
              href="/export/"
              className="text-sm font-bold underline"
            >
              Export
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
