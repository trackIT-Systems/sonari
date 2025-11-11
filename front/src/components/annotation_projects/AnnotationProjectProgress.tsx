import Card from "@/components/Card";
import Empty from "@/components/Empty";
import {
  CompleteIcon,
  EditIcon,
  InformationCircleIcon,
  NeedsReviewIcon,
  VerifiedIcon,
  HelpIcon,
} from "@/components/icons";
import Loading from "@/components/Loading";
import MetricBadge from "@/components/MetricBadge";
import useAnnotationProjectProgress from "@/hooks/api/useAnnotationProjectProgress";

import type { AnnotationProject } from "@/types";

export default function ProjectProgress({
  annotationProject,
}: {
  annotationProject: AnnotationProject;
}) {
  const { progress: rawProgress, isLoading } = useAnnotationProjectProgress({
    annotationProjectId: annotationProject.id,
  });

  const progress = rawProgress
    ? {
        total: rawProgress.total,
        done: {
          count: rawProgress.total - rawProgress.pending,
          verified: rawProgress.verified,
          completed: rawProgress.completed,
          rejected: rawProgress.rejected,
        },
        pending: {
          count: rawProgress.pending,
          assigned: rawProgress.assigned,
        },
      }
    : {
        total: 0,
        done: {
          count: 0,
          verified: 0,
          completed: 0,
          rejected: 0,
        },
        pending: {
          count: 0,
          assigned: 0,
        },
      };

  return (
    <Card>
      {isLoading ? (
        <Loading />
      ) : progress.total === 0 ? (
        <NoTasks />
      ) : (
        <ProgressReport
          isLoading={isLoading}
          missing={progress.pending.count}
          needReview={progress.done.rejected}
          completed={progress.done.completed}
          verified={progress.done.verified}
          unsure={progress.pending.assigned}
          total={progress.total}
        />
      )}
    </Card>
  );
}

function NoTasks() {
  return (
    <Empty>
      <p>
        No annotation tasks have been created for this project. To begin
        annotating, click the{" "}
        <span className="inline text-emerald-500">Add tasks</span> button above.
      </p>
    </Empty>
  );
}

function ProgressReport({
  isLoading,
  missing,
  needReview,
  completed,
  verified,
  unsure,
  total,
}: {
  isLoading: boolean;
  missing: number;
  needReview: number;
  completed: number;
  verified: number;
  unsure: number;
  total: number,
}) {
  return (
    <>
      <div className="flex flex-row gap-2 justify-around">
        <MetricBadge
          icon={<InformationCircleIcon className="inline-block w-8 h-8 text-gray-500" />}
          title="Total"
          value={total}
          isLoading={isLoading}
        />
        <MetricBadge
          icon={<EditIcon className="inline-block w-8 h-8 text-gray-500" />}
          title="Remaining"
          value={missing}
          isLoading={isLoading}
        />
        <MetricBadge
          icon={
            <CompleteIcon className="inline-block w-8 h-8 text-emerald-500" />
          }
          title="Accepted"
          value={completed}
          isLoading={isLoading}
        />
        <MetricBadge
          icon={
            <HelpIcon className="inline-block w-8 h-8 text-amber-500" />
          }
          title="Unsure"
          value={unsure}
          isLoading={isLoading}
        />
        <MetricBadge
          icon={
            <NeedsReviewIcon className="inline-block w-8 h-8 text-red-500" />
          }
          title="Rejected"
          value={needReview}
          isLoading={isLoading}
        />
        <MetricBadge
          icon={
            <VerifiedIcon className="inline-block w-8 h-8 text-blue-500" />
          }
          title="Verified"
          value={verified}
          isLoading={isLoading}
        />
      </div>
    </>
  );
}