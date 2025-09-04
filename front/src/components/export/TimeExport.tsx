import { useState } from "react";
import { AnnotationStatusSchema } from "@/schemas";
import { useExportSelection } from "@/hooks/useExportSelection";
import { useExportDownload } from "@/hooks/useExportDownload";
import {
  ExportProjectSelection,
  ExportTagSelection,
  ExportStatusSelection,
  ExportDateRangeFilter,
  ExportSummary,
  TimePeriodType,
  PredefinedPeriod,
  TimeUnit
} from "./shared";
import ExportTimePeriodConfiguration from "./shared/ExportTimePeriodConfiguration";
import api from "@/app/api";
import Info from "@/components/Info";

export default function TimeExport() {
  const exportSelection = useExportSelection();
  const { downloadFile } = useExportDownload();

  // Time period configuration
  const [timePeriodType, setTimePeriodType] = useState<TimePeriodType>('predefined');
  const [predefinedPeriod, setPredefinedPeriod] = useState<PredefinedPeriod>('minute');
  const [customPeriodValue, setCustomPeriodValue] = useState<number>(1);
  const [customPeriodUnit, setCustomPeriodUnit] = useState<TimeUnit>('minutes');

  const handleExport = async () => {
    if (exportSelection.selectedProjects.length === 0) return;
    exportSelection.setIsExporting(true);
    try {
      const tags = exportSelection.selectedTags.map(tag => `${tag.key}:${tag.value}`);
      const statusesToUse = exportSelection.selectedStatuses.length > 0
        ? exportSelection.selectedStatuses
        : Object.values(AnnotationStatusSchema.enum);

      // Prepare time period configuration
      const timePeriod = timePeriodType === 'predefined'
        ? { type: 'predefined' as const, value: predefinedPeriod }
        : { type: 'custom' as const, value: customPeriodValue, unit: customPeriodUnit };

      // Format dates for API (YYYY-MM-DD format)
      const formattedStartDate = exportSelection.startDate ? exportSelection.startDate.toISOString().split('T')[0] : undefined;
      const formattedEndDate = exportSelection.endDate ? exportSelection.endDate.toISOString().split('T')[0] : undefined;

      const { blob, filename } = await api.export.time(
        exportSelection.selectedProjects,
        tags,
        statusesToUse,
        timePeriod,
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
        <Info title="Time:">
          This export analyzes recordings by counting events within specified time periods. 
          It creates a CSV file showing the number of events for each species during different time intervals 
          (like hourly, daily, or custom periods).
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

        <ExportTimePeriodConfiguration
          timePeriodType={timePeriodType}
          predefinedPeriod={predefinedPeriod}
          customPeriodValue={customPeriodValue}
          customPeriodUnit={customPeriodUnit}
          onTimePeriodTypeChange={setTimePeriodType}
          onPredefinedPeriodChange={setPredefinedPeriod}
          onCustomPeriodValueChange={setCustomPeriodValue}
          onCustomPeriodUnitChange={setCustomPeriodUnit}
        />
      </div>

      <ExportSummary
        isExporting={exportSelection.isExporting}
        isSelectionValid={exportSelection.validation.isValid}
        selectedProjectsCount={exportSelection.selectedProjects.length}
        selectedTagsCount={exportSelection.selectedTags.length}
        selectedStatusesCount={exportSelection.selectedStatuses.length}
        onExport={handleExport}
        exportButtonText="Export Time Data"
        summaryDescription="Once satisfied with your selections, click the button below to export the time-based event counts."
      />
    </div>
  );
}
