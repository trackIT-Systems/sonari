import { useState } from "react";
import { useExportSelection } from "@/hooks/useExportSelection";
import { useExportDownload } from "@/hooks/useExportDownload";
import {
  ExportProjectSelection,
  ExportTagSelection,
  ExportStatusSelection,
  ExportDateRangeFilter,
  ExportSummary,
} from "./shared";
import ExportGroupTagsToggle from "./shared/ExportGroupTagsToggle";
import api from "@/app/api";
import Info from "@/components/Info";

export default function ProBatExport() {
  const exportSelection = useExportSelection();
  const { downloadFile } = useExportDownload();
  const [groupSpecies, setGroupSpecies] = useState<boolean>(false);

  const handleExport = async () => {
    if (exportSelection.selectedProjects.length === 0) return;
    exportSelection.setIsExporting(true);
    try {
      const tags = exportSelection.selectedTags.map((tag) => `${tag.key}:${tag.value}`);
      const statusesToUse =
        exportSelection.selectedStatuses.length > 0
          ? exportSelection.selectedStatuses
          : undefined;

      const formattedStartDate = exportSelection.startDate
        ? exportSelection.startDate.toISOString().split("T")[0]
        : undefined;
      const formattedEndDate = exportSelection.endDate
        ? exportSelection.endDate.toISOString().split("T")[0]
        : undefined;

      const { blob, filename } = await api.export.probat(
        exportSelection.selectedProjects,
        tags,
        statusesToUse,
        formattedStartDate,
        formattedEndDate,
        groupSpecies,
      );

      downloadFile(blob, filename);
    } catch (error) {
      console.error("Export failed:", error);
    } finally {
      exportSelection.setIsExporting(false);
    }
  };

  return (
    <div className="space-y-8">
      <Info title="ProBat:">
        This export creates a semicolon-separated CSV for ProBat with one row per recording and species:
        species code, confidence, recording time, filename, task notes, and call count per species.
        Leave tags empty to include all species tags on sound events. Leave statuses empty to include all tasks.
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
            exportButtonText="Export ProBat"
            summaryDescription="Once satisfied with your selections, click the button below to export in ProBat CSV format."
          />
        </div>

        <div className="flex flex-col gap-y-6 min-w-0">
          <ExportTagSelection
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
