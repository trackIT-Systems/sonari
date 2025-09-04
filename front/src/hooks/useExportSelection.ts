import { useEffect, useState } from "react";
import { AnnotationStatusSchema } from "@/schemas";
import type { Tag, AnnotationStatus, AnnotationProject } from "@/types";
import api from "@/app/api";
import type { Option } from "@/components/inputs/Select";

export interface ExportSelectionState {
  // Project selection
  selectedProjects: AnnotationProject[];
  availableProjects: Option<AnnotationProject>[];
  availableProjectOptions: Option<AnnotationProject>[];
  projectTagList: Tag[];
  selectedProjectTags: Tag[];
  
  // Tag selection (optional)
  selectedTags: Tag[];
  projectTags: Tag[];
  availableTags: Tag[];
  
  // Status selection (optional)
  selectedStatuses: (AnnotationStatus | string)[];
  allStatusOptions: readonly (AnnotationStatus | string)[];
  
  // Date range (optional)
  startDate: Date | null;
  endDate: Date | null;
  
  // Loading state
  isExporting: boolean;
}

export interface ExportSelectionActions {
  // Project actions
  handleProjectSelect: (tag: Tag) => void;
  handleProjectDeselect: (tag: Tag) => void;
  
  // Tag actions (optional)
  handleTagSelect: (tag: Tag) => void;
  handleTagDeselect: (tag: Tag) => void;
  handleSelectAllTags: () => void;
  
  // Status actions (optional)
  handleStatusToggle: (status: AnnotationStatus | string) => void;
  
  // Date actions (optional)
  setStartDate: (date: Date | null) => void;
  setEndDate: (date: Date | null) => void;
  
  // Export state
  setIsExporting: (isExporting: boolean) => void;
}

export interface UseExportSelectionOptions {
  includeTags?: boolean;
  includeStatuses?: boolean;
  includeDateRange?: boolean;
}

export function useExportSelection(options: UseExportSelectionOptions = {}) {
  const {
    includeTags = true,
    includeStatuses = true,
    includeDateRange = true
  } = options;

  // Project selection state
  const [selectedProjects, setSelectedProjects] = useState<AnnotationProject[]>([]);
  const [availableProjects, setAvailableProjects] = useState<Option<AnnotationProject>[]>([]);
  
  // Tag selection state
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [projectTags, setProjectTags] = useState<Tag[]>([]);
  
  // Status selection state
  const [selectedStatuses, setSelectedStatuses] = useState<(AnnotationStatus | string)[]>([]);
  const allStatusOptions = [...Object.values(AnnotationStatusSchema.enum), "no"] as const;
  
  // Date range state
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  
  // Export state
  const [isExporting, setIsExporting] = useState(false);

  // Fetch projects on mount
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

  // Update project tags when selected projects change
  useEffect(() => {
    if (!includeTags) return;
    
    if (selectedProjects.length === 0) {
      setProjectTags([]);
      setSelectedTags([]);
      if (includeStatuses) {
        setSelectedStatuses([]);
      }
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
    if (includeStatuses) {
      setSelectedStatuses([]);
    }
  }, [selectedProjects, includeTags, includeStatuses]);

  // Computed values
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

  const availableTags = includeTags ? projectTags.filter(tag =>
    !selectedTags.some(t => t.key === tag.key && t.value === tag.value)
  ) : [];

  // Action handlers
  const handleProjectSelect = (tag: Tag) => {
    const project = availableProjects.find(p => p.label === tag.value)?.value;
    if (project && !selectedProjects.some(p => p.uuid === project.uuid)) {
      setSelectedProjects(prev => [...prev, project]);
    }
  };

  const handleProjectDeselect = (tag: Tag) => {
    setSelectedProjects(prev => prev.filter(p => p.name !== tag.value));
  };

  const handleTagSelect = (tag: Tag) => {
    if (!includeTags) return;
    setSelectedTags(prev => [...prev, tag]);
  };

  const handleTagDeselect = (tag: Tag) => {
    if (!includeTags) return;
    setSelectedTags(prev => prev.filter(t => t.key !== tag.key || t.value !== tag.value));
  };

  const handleSelectAllTags = () => {
    if (!includeTags || availableTags.length === 0) return;
    setSelectedTags(prev => {
      const tagsToAdd = availableTags.filter(avail => !prev.some(sel => sel.key === avail.key && sel.value === avail.value));
      return [...prev, ...tagsToAdd];
    });
  };

  const handleStatusToggle = (status: AnnotationStatus | string) => {
    if (!includeStatuses) return;
    setSelectedStatuses(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  };

  // Selection validation
  const getSelectionValidation = () => {
    const hasProjects = selectedProjects.length > 0;
    const hasTags = !includeTags || selectedTags.length > 0;
    const hasStatuses = !includeStatuses || selectedStatuses.length > 0;
    
    return {
      isValid: hasProjects && hasTags && hasStatuses,
      hasProjects,
      hasTags,
      hasStatuses
    };
  };

  const state: ExportSelectionState = {
    selectedProjects,
    availableProjects,
    availableProjectOptions,
    projectTagList,
    selectedProjectTags,
    selectedTags,
    projectTags,
    availableTags,
    selectedStatuses,
    allStatusOptions,
    startDate,
    endDate,
    isExporting,
  };

  const actions: ExportSelectionActions = {
    handleProjectSelect,
    handleProjectDeselect,
    handleTagSelect,
    handleTagDeselect,
    handleSelectAllTags,
    handleStatusToggle,
    setStartDate,
    setEndDate,
    setIsExporting,
  };

  return {
    ...state,
    ...actions,
    validation: getSelectionValidation(),
  };
}
