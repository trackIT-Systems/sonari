import Button from "@/components/Button";
import Card from "@/components/Card";
import { H3 } from "@/components/Headings";
import Loading from "@/components/Loading";

interface ExportSummaryProps {
  isExporting: boolean;
  isSelectionValid: boolean;
  selectedProjectsCount: number;
  selectedTagsCount?: number;
  selectedStatusesCount?: number;
  onExport: () => void;
  exportButtonText: string;
  emptySelectionMessage?: string;
  summaryDescription?: string;
}

export default function ExportSummary({
  isExporting,
  isSelectionValid,
  selectedProjectsCount,
  selectedTagsCount,
  selectedStatusesCount,
  onExport,
  exportButtonText,
  emptySelectionMessage = "Select at least one project",
  summaryDescription,
}: ExportSummaryProps) {
  return (
    <Card>
      {isExporting ? (
        <Loading />
      ) : isSelectionValid ? (
        <>
          <H3>Summary</H3>
          <ul className="list-disc list-inside mb-4">
            <li>
              Selected projects: <span className="text-emerald-500">{selectedProjectsCount}</span>
            </li>
            {selectedTagsCount !== undefined && (
              <li>
                Selected tags: <span className="text-emerald-500">{selectedTagsCount}</span>
              </li>
            )}
            {selectedStatusesCount !== undefined && (
              <li>
                Selected statuses: <span className="text-emerald-500">{selectedStatusesCount}</span>
              </li>
            )}
          </ul>
          {summaryDescription && (
            <p className="text-stone-500 mb-4">
              {summaryDescription}
            </p>
          )}
          <Button onClick={onExport} className="w-full">
            {exportButtonText}
          </Button>
        </>
      ) : (
        <p className="text-stone-500">{emptySelectionMessage}</p>
      )}
    </Card>
  );
}
