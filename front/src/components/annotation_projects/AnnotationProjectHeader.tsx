import {
  useRouter,
  useSearchParams,
  useSelectedLayoutSegment,
} from "next/navigation";

import Header from "@/components/Header";
import { H1 } from "@/components/Headings";
import { DatasetIcon, EditIcon, ClipsIcon, TagsIcon, TasksIcon, DownloadIcon } from "@/components/icons";
import Tabs from "@/components/Tabs";

import type { AnnotationProject } from "@/types";

export default function AnnotationProjectHeader({
  annotationProject,
}: {
  annotationProject: AnnotationProject;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const selectedLayoutSegment = useSelectedLayoutSegment();

  return (
    <Header>
      <div className="flex overflow-x-auto flex-row space-x-4 w-full">
        <H1 className="overflow-auto max-w-xl whitespace-nowrap">
          {annotationProject.name}
        </H1>
        <Tabs
          tabs={[
            {
              id: "overview",
              title: "Overview",
              isActive: selectedLayoutSegment === null,
              icon: <DatasetIcon className="w-5 h-5 align-middle" />,
              onClick: () => {
                router.push(
                  `/annotation_projects/detail/?${params?.toString() || ''}`,
                );
              },
            },
            {
              id: "clips",
              title: "Clips",
              isActive: selectedLayoutSegment === "clips",
              icon: <ClipsIcon className="w-5 h-5 align-middle"/>,
              onClick: () => {
                router.push(
                  `/annotation_projects/detail/clips/?${params?.toString() || ''}`,
                );
              },
            },
            {
              id: "annotate",
              title: "Annotate",
              isActive: selectedLayoutSegment === "annotation",
              icon: <EditIcon className="w-5 h-5 align-middle" />,
              onClick: () => {
                router.push(
                  `/annotation_projects/detail/annotation/?${params?.toString() || ''}`,
                );
              },
            },
            {
              id: "export",
              title: "Export",
              isActive: selectedLayoutSegment === "export",
              icon: <DownloadIcon className="w-5 h-5 align-middle" />,
              onClick: () => {
                router.push(
                  `/annotation_projects/detail/export/?${params?.toString() || ''}`,
                );
              },
            },
          ]}
        />
      </div>
    </Header>
  );
}
