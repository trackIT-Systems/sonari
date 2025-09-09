import { useExportSelection } from "@/hooks/useExportSelection";
import { useExportDownload } from "@/hooks/useExportDownload";
import { ExportProjectSelection, ExportSummary } from "./shared";
import api from "@/app/api";
import Info from "@/components/Info";

export default function DumpExport() {
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
      const { blob, filename } = await api.export.dump(exportSelection.selectedProjects);
      downloadFile(blob, filename);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      exportSelection.setIsExporting(false);
    }
  };

  return (
    <div className="space-y-8">

      <Info title="Dump:">
        This export provides a comprehensive CSV file containing all detailed information about detected sound events
        in your recordings. It includes technical data like confidence scores, frequency ranges, timing information,
        user annotations, and file metadata - essentially a complete data dump of everything the system knows about
        your sound recordings. <b>Note: export one project at a time. This export is really slow!</b>
      </Info>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="flex flex-col gap-y-6 max-w-prose">

          <ExportProjectSelection
            projectTagList={exportSelection.projectTagList}
            selectedProjectTags={exportSelection.selectedProjectTags}
            onProjectSelect={exportSelection.handleProjectSelect}
            onProjectDeselect={exportSelection.handleProjectDeselect}
          />
        </div>
        <div className="flex flex-col gap-y-6 min-w-0">
          <ExportSummary
            isExporting={exportSelection.isExporting}
            isSelectionValid={exportSelection.validation.isValid}
            selectedProjectsCount={exportSelection.selectedProjects.length}
            onExport={handleExport}
            exportButtonText="Export Dump"
            summaryDescription="Once satisfied with your selections, click the button below to create a project dump."
          />
        </div>
      </div>
    </div>
  );
}
