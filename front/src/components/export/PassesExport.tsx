import { useState } from "react";
import Card from "@/components/Card";
import Button from "@/components/Button";
import { AnnotationStatusSchema } from "@/schemas";
import { useExportSelection } from "@/hooks/useExportSelection";
import { useExportDownload } from "@/hooks/useExportDownload";
import {
  ExportProjectSelection,
  ExportTagSelection,
  ExportStatusSelection,
  ExportDateRangeFilter,
  ExportSummary,
  ExportPassesConfiguration,
  TimePeriodType,
  PredefinedPeriod,
  TimeUnit
} from "./shared";
import PassesChart from "./PassesChart";
import api from "@/app/api";
import Info from "@/components/Info";

export default function PassesExport() {
  const exportSelection = useExportSelection();
  const { downloadFile } = useExportDownload();

  // Passes configuration
  const [eventCount, setEventCount] = useState<number>(2);
  const [timePeriodType, setTimePeriodType] = useState<TimePeriodType>('predefined');
  const [predefinedPeriod, setPredefinedPeriod] = useState<PredefinedPeriod>('minute');
  const [customPeriodValue, setCustomPeriodValue] = useState<number>(1);
  const [customPeriodUnit, setCustomPeriodUnit] = useState<TimeUnit>('minutes');

  // Chart preview state
  const [chartData, setChartData] = useState<{
    csv_data: string;
    chart_image: string;
    filename: string;
    passes_data: any[];
  } | null>(null);
  const [showPreview, setShowPreview] = useState<boolean>(false);

  const handleGeneratePreview = async () => {
    if (exportSelection.selectedProjects.length === 0) return;
    exportSelection.setIsExporting(true);
    try {
      const tags = exportSelection.selectedTags.map(tag => `${tag.key}:${tag.value}`);
      const statusesToUse = exportSelection.selectedStatuses.length > 0
        ? exportSelection.selectedStatuses
        : Object.values(AnnotationStatusSchema.enum);

      // Prepare passes configuration
      const passesConfig = {
        eventCount,
        timePeriod: timePeriodType === 'predefined'
          ? { type: 'predefined' as const, value: predefinedPeriod }
          : { type: 'custom' as const, value: customPeriodValue, unit: customPeriodUnit }
      };

      // Format dates for API (YYYY-MM-DD format)
      const formattedStartDate = exportSelection.startDate ? exportSelection.startDate.toISOString().split('T')[0] : undefined;
      const formattedEndDate = exportSelection.endDate ? exportSelection.endDate.toISOString().split('T')[0] : undefined;

      // Generate preview with chart
      const result = await api.export.passes(
        exportSelection.selectedProjects,
        tags,
        statusesToUse,
        passesConfig.eventCount,
        passesConfig.timePeriod,
        formattedStartDate,
        formattedEndDate,
      );

      if ('chart_image' in result) {
        setChartData(result);
        setShowPreview(true);
      }
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      exportSelection.setIsExporting(false);
    }
  };

  const handleDownload = async () => {
    if (!chartData) return;

    // Download CSV first
    if (chartData.csv_data) {
      const csvBlob = new Blob([chartData.csv_data], { type: 'text/csv' });
      downloadFile(csvBlob, `${chartData.filename}.csv`);
      
      // Add a small delay to prevent browser blocking multiple downloads
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Download Chart as PNG
    if (chartData.chart_image) {
      try {
        const byteCharacters = atob(chartData.chart_image);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const chartBlob = new Blob([byteArray], { type: 'image/png' });
        downloadFile(chartBlob, `${chartData.filename}_chart.png`);
      } catch (error) {
        console.error('Error processing chart image:', error);
      }
    }
  };


  return (
    <div className="space-y-8">
      <Info title="Passes:">
        Passes: This export analyzes your recordings for passes, i.e., individual recordings containing a minimum number of echolocation calls (≥ threshold) for each species. The analysis counts how many such qualifying recordings occur within each time period.
      </Info>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="flex flex-col gap-y-6 min-w-0">
          <ExportProjectSelection
            projectTagList={exportSelection.projectTagList}
            selectedProjectTags={exportSelection.selectedProjectTags}
            onProjectSelect={exportSelection.handleProjectSelect}
            onProjectDeselect={exportSelection.handleProjectDeselect}
          />

          <ExportStatusSelection
            allStatusOptions={exportSelection.allStatusOptions}
            selectedStatuses={exportSelection.selectedStatuses}
            onStatusToggle={exportSelection.handleStatusToggle}
          />

          <ExportPassesConfiguration
            eventCount={eventCount}
            timePeriodType={timePeriodType}
            predefinedPeriod={predefinedPeriod}
            customPeriodValue={customPeriodValue}
            customPeriodUnit={customPeriodUnit}
            onEventCountChange={setEventCount}
            onTimePeriodTypeChange={setTimePeriodType}
            onPredefinedPeriodChange={setPredefinedPeriod}
            onCustomPeriodValueChange={setCustomPeriodValue}
            onCustomPeriodUnitChange={setCustomPeriodUnit}
          />

          <ExportSummary
            isExporting={exportSelection.isExporting}
            isSelectionValid={exportSelection.validation.isValid}
            selectedProjectsCount={exportSelection.selectedProjects.length}
            selectedTagsCount={exportSelection.selectedTags.length}
            selectedStatusesCount={exportSelection.selectedStatuses.length}
            onExport={handleGeneratePreview}
            exportButtonText="Generate Export"
            summaryDescription="Once satisfied with your selections, click the button below to generate the export. A preview will be shown below."
          />
        </div>

        {/* Right Column */}
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

      {/* Chart Preview Section - Shows below the main layout */}
      {showPreview && chartData && (
        <Card>
          <PassesChart
            chartImage={chartData.chart_image}
          />
            <Button onClick={handleDownload} className="w-full">
              Download
            </Button>
        </Card>
      )}
    </div>
  );
}
