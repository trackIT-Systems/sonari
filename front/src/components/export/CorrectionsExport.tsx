import { useExportSelection } from "@/hooks/useExportSelection";
import { useExportDownload } from "@/hooks/useExportDownload";
import { ExportProjectSelection, ExportSummary } from "./shared";
import api from "@/app/api";
import Info from "@/components/Info";

export default function CorrectionsExport() {
  const exportSelection = useExportSelection({
    includeTags: false,
    includeStatuses: false,
    includeDateRange: false,
  });
  const { downloadFile } = useExportDownload();

  const handleExport = async () => {
    if (exportSelection.selectedProjects.length === 0) return;

    exportSelection.setIsExporting(true);
    try {
      const { blob, filename } = await api.export.corrections(exportSelection.selectedProjects);
      downloadFile(blob, filename);
    } catch (error) {
      console.error("Export failed:", error);
    } finally {
      exportSelection.setIsExporting(false);
    }
  };

  return (
    <div className="space-y-8 overflow-visible">
      <Info title="Corrections:">
        This export compares the detector predictions stored in the GUANO files next to the recordings with what
        reviewers made of them. Only completed or verified tasks are included. Each predicted tag gets one row with its
        outcome: confirmed, relabeled, tag removed or event deleted. Tags reviewers added that no prediction covered are
        listed as added. The rows include the predicted label and confidence, the final tags, whether the box was
        adjusted, and who reviewed the task and when.
      </Info>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 overflow-visible">
        <div className="flex flex-col gap-y-6 overflow-visible">
          <ExportProjectSelection
            projectTagList={exportSelection.projectTagList}
            selectedProjectTags={exportSelection.selectedProjectTags}
            onProjectSelect={exportSelection.handleProjectSelect}
            onProjectDeselect={exportSelection.handleProjectDeselect}
            isLoadingProjects={exportSelection.isLoadingProjects}
            totalProjects={exportSelection.totalProjects}
          />
        </div>
        <div className="flex flex-col gap-y-6 min-w-0">
          <ExportSummary
            isExporting={exportSelection.isExporting}
            isSelectionValid={exportSelection.validation.isValid}
            selectedProjectsCount={exportSelection.selectedProjects.length}
            onExport={handleExport}
            exportButtonText="Export Corrections"
            summaryDescription="Once satisfied with your selection, click the button below to export the corrections."
          />
        </div>
      </div>
    </div>
  );
}
