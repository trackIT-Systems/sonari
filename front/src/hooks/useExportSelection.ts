import { useEffect, useState, useCallback } from "react";
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
  
  // Status selection (optional)
  selectedStatuses: (AnnotationStatus | string)[];
  allStatusOptions: readonly (AnnotationStatus | string)[];
  
  // Date range (optional)
  startDate: Date | null;
  endDate: Date | null;
  
  // Loading state
  isExporting: boolean;
  isLoadingProjects: boolean;
  totalProjects: number;
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

  // State for loading all projects
  const [allProjects, setAllProjects] = useState<AnnotationProject[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);

  // Project selection state
  const [selectedProjects, setSelectedProjects] = useState<AnnotationProject[]>([]);
  const [availableProjects, setAvailableProjects] = useState<Option<AnnotationProject>[]>([]);
  
  // Tag selection state
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  
  // Status selection state
  const [selectedStatuses, setSelectedStatuses] = useState<(AnnotationStatus | string)[]>([]);
  const allStatusOptions = [...Object.values(AnnotationStatusSchema.enum), "no"] as const;
  
  // Date range state
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  
  // Export state
  const [isExporting, setIsExporting] = useState(false);

  // Function to load all projects progressively
  const loadAllProjects = useCallback(async () => {
    setIsLoadingProjects(true);
    try {
      const allProjects: AnnotationProject[] = [];
      let offset = 0;
      const pageSize = 100;
      let hasMore = true;

      while (hasMore) {
        const page = await api.annotationProjects.getMany({ limit: pageSize, offset });
        allProjects.push(...page.items);
        offset += pageSize;
        hasMore = page.items.length === pageSize; // Continue if we got a full page
      }

      setAllProjects(allProjects);
    } catch (err) {
      console.error("Failed to fetch all projects", err);
    } finally {
      setIsLoadingProjects(false);
    }
  }, []);

  // Load all projects on mount
  useEffect(() => {
    loadAllProjects();
  }, [loadAllProjects]);

  // Convert projects to options when projects change
  useEffect(() => {
    const options = allProjects.map(project => ({
      id: project.id,
      label: project.name,
      value: project,
    }));
    setAvailableProjects(options);
  }, [allProjects]);

  // Reset selections when projects change
  useEffect(() => {
    if (selectedProjects.length === 0) {
      setSelectedTags([]);
      if (includeStatuses) {
        setSelectedStatuses([]);
      }
    }
  }, [selectedProjects, includeStatuses]);

  // Computed values
  const availableProjectOptions = availableProjects.filter(p =>
    !selectedProjects.some(selected => selected.id === p.value.id)
  );

  const projectTagList: Tag[] = availableProjectOptions.map(p => ({
    key: "",
    value: p.value.name,
  }));

  const selectedProjectTags: Tag[] = selectedProjects.map(p => ({
    key: "",
    value: p.name,
  }));

  // Action handlers
  const handleProjectSelect = (tag: Tag) => {
    const project = availableProjects.find(p => p.label === tag.value)?.value;
    if (project && !selectedProjects.some(p => p.id === project.id)) {
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

  const handleSelectAllTags = async () => {
    if (!includeTags) return;
    
    try {
      // Fetch all tags from the system when "Select All" is pressed
      const allTags: Tag[] = [];
      let offset = 0;
      const pageSize = 100;
      let hasMore = true;

      while (hasMore) {
        const page = await api.tags.get({ limit: pageSize, offset });
        allTags.push(...page.items);
        offset += pageSize;
        hasMore = page.items.length === pageSize;
      }

      // Add only tags that aren't already selected
      setSelectedTags(prev => {
        const tagsToAdd = allTags.filter(
          tag => !prev.some(sel => sel.key === tag.key && sel.value === tag.value)
        );
        return [...prev, ...tagsToAdd];
      });
    } catch (err) {
      console.error("Failed to fetch all tags", err);
    }
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
    selectedStatuses,
    allStatusOptions,
    startDate,
    endDate,
    isExporting,
    isLoadingProjects,
    totalProjects: allProjects.length,
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
