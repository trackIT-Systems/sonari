import { useEffect, useState } from "react";
import { AnnotationStatusSchema } from "@/schemas";
import Button from "@/components/Button";
import Card from "@/components/Card";
import { H3 } from "@/components/Headings";
import { CheckIcon, CloseIcon, VerifiedIcon, HelpIcon, NoIcon } from "@/components/icons";
import TagList from "@/components/tags/TagList";
import Tooltip from "@/components/Tooltip";
import Loading from "@/components/Loading";

import type { Tag, AnnotationStatus, AnnotationProject } from "@/types";
import api from "@/app/api";
import type { Option } from "@/components/inputs/Select";

const statusIcons: Record<AnnotationStatus | string, React.ReactNode> = {
  verified: <VerifiedIcon className="w-6 h-6 text-blue-500" />,
  rejected: <CloseIcon className="w-6 h-6 text-red-500" />,
  assigned: <HelpIcon className="w-6 h-6 text-amber-500" />,
  completed: <CheckIcon className="w-6 h-6 text-emerald-500" />,
  "no": <NoIcon className="w-6 h-6 text-slate-500" />,
};

const statusTooltips: Record<AnnotationStatus | string, string> = {
  verified: "Verified",
  rejected: "Reject",
  assigned: "Unsure",
  completed: "Accept",
  "no": "No State",
};

export default function MultiBaseExport() {
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<(AnnotationStatus | string)[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<AnnotationProject[]>([]);
  
  // Combined array of schema statuses plus the special "no" option
  const allStatusOptions = [...Object.values(AnnotationStatusSchema.enum), "no"] as const;
  const [projectTags, setProjectTags] = useState<Tag[]>([]);
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

  const handleTagSelect = (tag: Tag) => {
    setSelectedTags(prev => [...prev, tag]);
  };

  const handleTagDeselect = (tag: Tag) => {
    setSelectedTags(prev => prev.filter(t => t.key !== tag.key || t.value !== tag.value));
  };

  const handleSelectAllTags = () => {
    if (availableTags.length === 0) return;
    setSelectedTags(prev => {
      // Add only the tags that are not already selected
      const tagsToAdd = availableTags.filter(avail => !prev.some(sel => sel.key === avail.key && sel.value === avail.value));
      return [...prev, ...tagsToAdd];
    });
  };

  const handleProjectSelect = (tag: Tag) => {
    const project = availableProjects.find(p => p.label === tag.value)?.value;
    if (project && !selectedProjects.some(p => p.uuid === project.uuid)) {
      setSelectedProjects(prev => [...prev, project]);
    }
  };

  const handleProjectDeselect = (tag: Tag) => {
    setSelectedProjects(prev => prev.filter(p => p.name !== tag.value));
  };

  const handleStatusToggle = (status: AnnotationStatus | string) => {
    setSelectedStatuses(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  };

  const handleExport = async () => {
    if (selectedProjects.length === 0) return;
    setIsExporting(true);
    try {
      const tags = selectedTags.map(tag => `${tag.key}:${tag.value}`);
      const statusesToUse = selectedStatuses.length > 0
        ? selectedStatuses
        : Object.values(AnnotationStatusSchema.enum);

      const { blob, filename } = await api.export.multibase(
        selectedProjects,
        tags,
        statusesToUse,
        true, // include_notes
        "DD.MM.YYYY" // date_format
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

  useEffect(() => {
    if (selectedProjects.length === 0) {
      setProjectTags([]);
      setSelectedTags([]);
      setSelectedStatuses([]);
      return;
    }
    const mergedTags = selectedProjects.flatMap(p => p.tags ?? []);
    const uniqueTagMap = new Map<string, Tag>();
    for (const tag of mergedTags) {
      const key = `${tag.key}:${tag.value}`;
      if (!uniqueTagMap.has(key)) {
        uniqueTagMap.set(key, tag);
      }
    }
    setProjectTags(Array.from(uniqueTagMap.values()));
    setSelectedTags([]);
    setSelectedStatuses([]);
  }, [selectedProjects]);

  const availableTags = projectTags.filter(tag =>
    !selectedTags.some(t => t.key === tag.key && t.value === tag.value)
  );

  const isSelectionMade = selectedTags.length > 0 && selectedProjects.length > 0 && selectedStatuses.length > 0;

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
        
        <Card>
          <div>
            <H3 className="text-lg">Tags</H3>
            <p className="text-stone-500">Select tags that should be exported.</p>
          </div>
          <div className="grid grid-cols-2 gap-y-4 gap-x-14">
            <div className="col-span-2 md:col-span-1">
              <label className="block mb-2 font-medium text-stone-600 dark:text-stone-400">Available Tags</label>
              <div className="flex items-center justify-between">
                <small className="text-stone-500">Click on a tag to add it to the export selection.</small>
                <Button
                  variant="secondary"
                  mode="outline"
                  padding="px-3 py-1.5"
                  onClick={handleSelectAllTags}
                  disabled={availableTags.length === 0}
                >
                  Select all
                </Button>
              </div>
              <div className="py-2">
                <TagList autoFocus={false} tags={availableTags} onClick={handleTagSelect} />
              </div>
            </div>
            <div className="col-span-2 md:col-span-1">
              <label className="block mb-2 font-medium text-stone-600 dark:text-stone-400">Selected Tags</label>
              <small className="text-stone-500">Click on a tag to remove it from the export selection.</small>
              <div className="py-2">
                <TagList autoFocus={false} tags={selectedTags} onClick={handleTagDeselect} />
              </div>
            </div>
          </div>
        </Card>
        
        <Card>
          <div>
            <H3>Select Task Statuses</H3>
            <p className="text-stone-500">Select status badges that should be exported.</p>
            <div className="flex flex-row gap-4">
              {allStatusOptions.map(status => (
                <Tooltip
                  key={status}
                  tooltip={statusTooltips[status as keyof typeof statusTooltips]}
                  placement="bottom"
                >
                  <button
                    className={`p-2 rounded-md ${selectedStatuses.includes(status)
                      ? "bg-stone-200 dark:bg-stone-700"
                      : "hover:bg-stone-100 dark:hover:bg-stone-800"
                      }`}
                    onClick={() => handleStatusToggle(status)}
                  >
                    {statusIcons[status as keyof typeof statusIcons]}
                  </button>
                </Tooltip>
              ))}
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
                  <li>
                    Selected tags: <span className="text-emerald-500">{selectedTags.length}</span>
                  </li>
                  <li>
                    Selected statuses: <span className="text-emerald-500">{selectedStatuses.length}</span>
                  </li>
                </ul>
                <p className="text-stone-500 mb-4">
                  Once satisfied with your selections, click the button below to export the project in MultiBase format.
                </p>
                <Button onClick={handleExport} className="w-full">
                  Export MultiBase
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
