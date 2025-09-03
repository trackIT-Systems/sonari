import { useEffect, useState } from "react";
import { AnnotationStatusSchema } from "@/schemas";
import Button from "@/components/Button";
import Card from "@/components/Card";
import { H3 } from "@/components/Headings";
import { CheckIcon, CloseIcon, VerifiedIcon, HelpIcon } from "@/components/icons";
import TagList from "@/components/tags/TagList";
import Tooltip from "@/components/Tooltip";
import Loading from "@/components/Loading";

import type { Tag, AnnotationStatus, AnnotationProject } from "@/types";
import api from "@/app/api";
import type { Option } from "@/components/inputs/Select";

const statusIcons: Record<AnnotationStatus, React.ReactNode> = {
  verified: <VerifiedIcon className="w-6 h-6 text-blue-500" />,
  rejected: <CloseIcon className="w-6 h-6 text-red-500" />,
  assigned: <HelpIcon className="w-6 h-6 text-amber-500" />,
  completed: <CheckIcon className="w-6 h-6 text-emerald-500" />,
};

const statusTooltips: Record<AnnotationStatus, string> = {
  verified: "Verified",
  rejected: "Reject",
  assigned: "Unsure",
  completed: "Accept",
};

export default function MultiBaseExport() {
  const [selectedProjects, setSelectedProjects] = useState<AnnotationProject[]>([]);
  const [availableProjects, setAvailableProjects] = useState<Option<AnnotationProject>[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    async function fetchProjects() {
      try {
        const page = await api.annotationProjects.getMany({});
        const projects = page.items;
        const options = projects.map(project => ({
          id: project.uuid,
          label: project.name,
          value: project,
        }));
        setAvailableProjects(options);
      } catch (err) {
        console.error("Failed to fetch projects", err);
      }
    }

    fetchProjects();
  }, []);

  const availableProjectOptions = availableProjects.filter(p =>
    !selectedProjects.some(selected => selected.uuid === p.value.uuid)
  );

  const projectTagList: Tag[] = availableProjectOptions.map(p => ({
    key: "",
    value: p.value.name,
  }));

  const selectedProjectTags: Tag[] = selectedProjects.map(p => ({
    key: "",
    value: p.name,
  }));

  const handleProjectSelect = (tag: Tag) => {
    const project = availableProjects.find(p => p.label === tag.value)?.value;
    if (project && !selectedProjects.some(p => p.uuid === project.uuid)) {
      setSelectedProjects(prev => [...prev, project]);
    }
  };

  const handleProjectDeselect = (tag: Tag) => {
    setSelectedProjects(prev => prev.filter(p => p.name !== tag.value));
  };

  const handleExport = async () => {
    if (selectedProjects.length === 0) return;
    setIsExporting(true);
    try {

      const { blob, filename } = await api.export.dump(
        selectedProjects,
      );
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const isSelectionMade = selectedProjects.length > 0;

  return (
    <div className="flex flex-row gap-8">
      <div className="flex flex-col gap-y-6 max-w-prose">
        <Card>
          <div>
            <H3 className="text-lg">Projects</H3>
            <p className="text-stone-500">Select projects to include in the export.</p>
          </div>
          <div className="grid grid-cols-2 gap-y-4 gap-x-14">
            <div className="col-span-2 md:col-span-1">
              <label className="block mb-2 font-medium text-stone-600 dark:text-stone-400">Available Projects</label>
              <small className="text-stone-500">Click a project to add it to the export selection.</small>
              <div className="py-2">
                <TagList autoFocus={true} tags={projectTagList} onClick={handleProjectSelect} />
              </div>
            </div>
            <div className="col-span-2 md:col-span-1">
              <label className="block mb-2 font-medium text-stone-600 dark:text-stone-400">Selected Projects</label>
              <small className="text-stone-500">Click a tag to remove it from the export selection.</small>
              <div className="py-2">
                <TagList autoFocus={false} tags={selectedProjectTags} onClick={handleProjectDeselect} />
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="w-96">
        <div className="sticky top-8">
          <Card>
            {isExporting ? (
              <Loading />
            ) : isSelectionMade ? (
              <>
                <H3>Summary</H3>
                <ul className="list-disc list-inside mb-4">
                  <li>
                    Selected projects: <span className="text-emerald-500">{selectedProjects.length}</span>
                  </li>
                </ul>
                <p className="text-stone-500 mb-4">
                  Once satisfied with your selections, click the button below to create a project dump.
                </p>
                <Button onClick={handleExport} className="w-full">
                  Export Dump
                </Button>
              </>
            ) : (
              <p className="text-stone-500">Select at least one project</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
