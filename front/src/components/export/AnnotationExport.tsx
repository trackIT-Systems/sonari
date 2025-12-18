import { useEffect, useState } from "react";
import { AnnotationStatusSchema } from "@/schemas";
import Button from "@/components/Button";
import Card from "@/components/Card";
import { H2, H3 } from "@/components/Headings";
import { DownloadIcon, CheckIcon, CloseIcon, VerifiedIcon, HelpIcon } from "@/components/icons";
import TagList from "@/components/tags/TagList";
import Tooltip from "@/components/Tooltip";
import useAnnotationProject from "@/hooks/api/useAnnotationProject";
import Toggle from "@/components/inputs/Toggle";
import { InputGroup } from "@/components/inputs/index";
import Loading from "@/components/Loading";

import type { Tag, AnnotationStatus, AnnotationProject } from "@/types";
import api from "@/app/api";
import AnnotationProjectList from "../annotation_projects/AnnotationProjectList";
import Select from "../inputs/Select"
import type { Option } from "@/components/inputs/Select"; // adjust path

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

type ExportFormat = 'MultiBase' | 'SoundEvent' | 'Territory';

export default function AnnotationExport() {
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<AnnotationStatus[]>([]);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('MultiBase');
  const [isExporting, setIsExporting] = useState(false);
  const [selectedProjects, setSelectedProjects] = useState<AnnotationProject[]>([]);
  const [projectTags, setProjectTags] = useState<Tag[]>([]);
  const [availableProjects, setAvailableProjects] = useState<Option<AnnotationProject>[]>([]);
  

  //const annotationProject = selectedProject ? useAnnotationProject({uuid: selectedProject.uuid, annotationProject: selectedProject}) : null;
  useEffect(() => {
    async function fetchProjects() {
      try {
        const page = await api.annotationProjects.getMany({limit: -1});
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
  
  const projectTagList: Tag[] = availableProjects.map(p => ({
    key: "project",
    value: typeof p.label === 'string' ? p.label : String(p.label ?? ''),
  }));  

  const selectedProjectTags: Tag[] = selectedProjects.map(p => ({
    key: "project",
    value: p.name,
  }));  
  
  
  const handleTagSelect = (tag: Tag) => {
    setSelectedTags(prev => [...prev, tag]);
  };

  const handleTagDeselect = (tag: Tag) => {
    setSelectedTags(prev => prev.filter(t => t.key !== tag.key || t.value !== tag.value));
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
  

  const handleStatusToggle = (status: AnnotationStatus) => {
    setSelectedStatuses(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  };

  const handleExportFormatChange = (format: ExportFormat) => {
    setExportFormat(format);
  };

  const handleExport = async () => {
    if (selectedProjects.length === 0) return;
    setIsExporting(true);
    try {
      const tagParams =
        selectedTags.length > 0
          ? selectedTags.map(tag => `tags=${encodeURIComponent(`${tag.key}:${tag.value}`)}`).join('&')
          : 'tags=[]';
  
      const statusParams =
        selectedStatuses.length > 0
          ? selectedStatuses.map(status => `statuses=${encodeURIComponent(status)}`).join('&')
          : 'statuses=[]';
  
      const queryString = `${tagParams}&${statusParams}&format=${exportFormat}`;
      const { blob, filename } = await api.annotationProjects.download(selectedProjects, queryString);
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

  const isSelectionMade = (exportFormat === 'SoundEvent') || 
    (selectedTags.length > 0 && selectedStatuses.length > 0);

    return (
        <div className="flex flex-col gap-8">
        <H2>
          <DownloadIcon className="inline-block mr-2 w-8 h-8 align-middle" />
          Export Annotation Projects
        </H2>
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
        <div className="flex flex-row gap-8">
          <div className="flex flex-col gap-y-6 max-w-prose">
            {selectedProjects ? (
              <>
                <Card>
                  <div>
                    <H3 className="text-lg">Tags</H3>
                    <p className="text-stone-500">Select tags that should be exported.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-y-4 gap-x-14">
                    <div className="col-span-2 md:col-span-1">
                      <label className="block mb-2 font-medium text-stone-600 dark:text-stone-400">Available Tags</label>
                      <small className="text-stone-500">Click on a tag to add it to the export selection.</small>
                      <div className="py-2">
                        <TagList autoFocus={true} tags={availableTags} onClick={handleTagSelect} />
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
                      {Object.values(AnnotationStatusSchema.enum).map(status => (
                        <Tooltip
                          key={status}
                          tooltip={statusTooltips[status as keyof typeof statusTooltips]}
                          placement="bottom"
                        >
                          <button
                            className={`p-2 rounded-md ${
                              selectedStatuses.includes(status)
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
                <Card>
                  <div>
                    <H3>Export Format</H3>
                    <p className="text-stone-500">Select the format for exporting the project data.</p>
                    <div className="flex flex-col gap-2">
                      <InputGroup name="multibase-format" label="MultiBase">
                        <Toggle
                          isSelected={exportFormat === "MultiBase"}
                          onChange={() => handleExportFormatChange("MultiBase")}
                        />
                      </InputGroup>
                      <InputGroup name="territory-format" label="Territory">
                        <Toggle
                          isSelected={exportFormat === "Territory"}
                          onChange={() => handleExportFormatChange("Territory")}
                        />
                      </InputGroup>
                      {/* <InputGroup name="soundevent-format" label="SoundEvent" help="Note: this ignores all selections from above.">
                        <Toggle
                          isSelected={exportFormat === "SoundEvent"}
                          onChange={() => handleExportFormatChange("SoundEvent")}
                        />
                          </InputGroup> */}
                    </div>
                  </div>
                </Card>
              </>
            ) : (
              <p className="text-stone-500">Please select a project to see export options.</p>
            )}
          </div>
          <div className="w-96">
            <div className="sticky top-8">
              {selectedProjects && (
                <Card>
                  {isExporting ? (
                    <Loading />
                  ) : isSelectionMade ? (
                    <>
                      <H3>Summary</H3>
                      {exportFormat !== "SoundEvent" && (
                        <ul className="list-disc list-inside mb-4">
                          <li>
                            Selected tags: <span className="text-emerald-500">{selectedTags.length}</span>
                          </li>
                          <li>
                            Selected statuses: <span className="text-emerald-500">{selectedStatuses.length}</span>
                          </li>
                        </ul>
                      )}
                      <p className="text-stone-500 mb-4">
                        {exportFormat === "SoundEvent"
                          ? "Click the button below to export the project in SoundEvent format."
                          : "Once satisfied with your selections, click the button below to export the project."}
                      </p>
                      <Button onClick={handleExport} className="w-full">
                        Export
                      </Button>
                    </>
                  ) : (
                    <p className="text-stone-500">
                      Select at least one tag and one status badge
                    </p>
                  )}
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }       