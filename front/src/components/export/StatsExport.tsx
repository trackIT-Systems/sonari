import { useState } from "react";
import { AnnotationStatusSchema } from "@/schemas";
import { useExportSelection } from "@/hooks/useExportSelection";
import { useExportDownload } from "@/hooks/useExportDownload";
import {
  ExportProjectSelection,
  ExportTagSelection,
  ExportStatusSelection,
  ExportDateRangeFilter,
  ExportSummary
} from "./shared";
import ExportGroupTagsToggle from "./shared/ExportGroupTagsToggle";
import api from "@/app/api";
import Info from "@/components/Info";

export default function StatsExport() {
  const exportSelection = useExportSelection();
  const { downloadFile } = useExportDownload();
  const [groupSpecies, setGroupSpecies] = useState<boolean>(false);

  const handleExport = async () => {
    if (exportSelection.selectedProjects.length === 0) return;
    exportSelection.setIsExporting(true);
    try {
      const tags = exportSelection.selectedTags.map(tag => `${tag.key}:${tag.value}`);
      const statusesToUse = exportSelection.selectedStatuses.length > 0
        ? exportSelection.selectedStatuses
        : Object.values(AnnotationStatusSchema.enum);

      // Format dates for API (YYYY-MM-DD format)
      const formattedStartDate = exportSelection.startDate ? exportSelection.startDate.toISOString().split('T')[0] : undefined;
      const formattedEndDate = exportSelection.endDate ? exportSelection.endDate.toISOString().split('T')[0] : undefined;

      const { blob, filename } = await api.export.stat(
        exportSelection.selectedProjects,
        tags,
        statusesToUse,
        formattedStartDate,
        formattedEndDate,
        groupSpecies,
      );

      downloadFile(blob, filename);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      exportSelection.setIsExporting(false);
    }
  };

  return (
    <div className="space-y-8">
      <Info title="Statistics:">
        This export generates summary statistics about your recording projects in CSV format. It provides an overview
        of how many recordings are available, their total duration, and breaks down the data by project, review status,
        and species tags, giving a high-level view.
      </Info>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="flex flex-col gap-y-6 min-w-0">
          <ExportProjectSelection
            projectTagList={exportSelection.projectTagList}
            selectedProjectTags={exportSelection.selectedProjectTags}
            onProjectSelect={exportSelection.handleProjectSelect}
            onProjectDeselect={exportSelection.handleProjectDeselect}
            isLoadingProjects={exportSelection.isLoadingProjects}
            totalProjects={exportSelection.totalProjects}
          />

          <ExportStatusSelection
            allStatusOptions={exportSelection.allStatusOptions}
            selectedStatuses={exportSelection.selectedStatuses}
            onStatusToggle={exportSelection.handleStatusToggle}
          />

          <ExportGroupTagsToggle
            groupSpecies={groupSpecies}
            onGroupSpeciesChange={setGroupSpecies}
          />

          <ExportSummary
            isExporting={exportSelection.isExporting}
            isSelectionValid={exportSelection.validation.isValid}
            selectedProjectsCount={exportSelection.selectedProjects.length}
            selectedTagsCount={exportSelection.selectedTags.length}
            selectedStatusesCount={exportSelection.selectedStatuses.length}
            onExport={handleExport}
            exportButtonText="Export Statistics"
            summaryDescription="Once satisfied with your selections, click the button below to export the statistics."
          />
        </div>

        <div className="flex flex-col gap-y-6 min-w-0">
          <ExportTagSelection
            availableTags={exportSelection.availableTags}
            selectedTags={exportSelection.selectedTags}
            onTagSelect={exportSelection.handleTagSelect}
            onTagDeselect={exportSelection.handleTagDeselect}
            onSelectAllTags={exportSelection.handleSelectAllTags}
          />
          <ExportDateRangeFilter
            startDate={exportSelection.startDate}
            endDate={exportSelection.endDate}
            onStartDateChange={exportSelection.setStartDate}
            onEndDateChange={exportSelection.setEndDate}
          />
        </div>

      </div>
    </div>
  );
}
