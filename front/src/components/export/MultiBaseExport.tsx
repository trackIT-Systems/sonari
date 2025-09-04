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
import api from "@/app/api";
import Info from "@/components/Info";

export default function MultiBaseExport() {
  const exportSelection = useExportSelection();
  const { downloadFile } = useExportDownload();

  const handleExport = async () => {
    if (exportSelection.selectedProjects.length === 0) return;
    exportSelection.setIsExporting(true);
    try {
      const tags = exportSelection.selectedTags.map(tag => `${tag.key}:${tag.value}`);
      const statusesToUse = exportSelection.selectedStatuses.length > 0
        ? exportSelection.selectedStatuses
        : Object.values(AnnotationStatusSchema.enum);

      const formattedStartDate = exportSelection.startDate ? exportSelection.startDate.toISOString().split('T')[0] : undefined;
      const formattedEndDate = exportSelection.endDate ? exportSelection.endDate.toISOString().split('T')[0] : undefined;

      const { blob, filename } = await api.export.multibase(
        exportSelection.selectedProjects,
        tags,
        statusesToUse,
        formattedStartDate,
        formattedEndDate,
      );
      
      downloadFile(blob, filename);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      exportSelection.setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-row gap-8">
      <div className="flex flex-col gap-y-6 max-w-prose">
        <Info title="MultiBase:">
          This export creates an Excel file containing species observations in a standardized MultiBase format. 
          It extracts identified tags from events along with location coordinates, dates, 
          and recording station information.
        </Info>
        
        <ExportProjectSelection
          projectTagList={exportSelection.projectTagList}
          selectedProjectTags={exportSelection.selectedProjectTags}
          onProjectSelect={exportSelection.handleProjectSelect}
          onProjectDeselect={exportSelection.handleProjectDeselect}
        />
        
        <ExportTagSelection
          availableTags={exportSelection.availableTags}
          selectedTags={exportSelection.selectedTags}
          onTagSelect={exportSelection.handleTagSelect}
          onTagDeselect={exportSelection.handleTagDeselect}
          onSelectAllTags={exportSelection.handleSelectAllTags}
        />
        
        <ExportStatusSelection
          allStatusOptions={exportSelection.allStatusOptions}
          selectedStatuses={exportSelection.selectedStatuses}
          onStatusToggle={exportSelection.handleStatusToggle}
        />

        <ExportDateRangeFilter
          startDate={exportSelection.startDate}
          endDate={exportSelection.endDate}
          onStartDateChange={exportSelection.setStartDate}
          onEndDateChange={exportSelection.setEndDate}
        />
      </div>

      <ExportSummary
        isExporting={exportSelection.isExporting}
        isSelectionValid={exportSelection.validation.isValid}
        selectedProjectsCount={exportSelection.selectedProjects.length}
        selectedTagsCount={exportSelection.selectedTags.length}
        selectedStatusesCount={exportSelection.selectedStatuses.length}
        onExport={handleExport}
        exportButtonText="Export MultiBase"
        summaryDescription="Once satisfied with your selections, click the button below to export the project in MultiBase format."
      />
    </div>
  );
}
