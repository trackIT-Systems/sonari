import Card from "@/components/Card";
import { H3 } from "@/components/Headings";
import { CheckIcon, CloseIcon, VerifiedIcon, HelpIcon, NoIcon } from "@/components/icons";
import Tooltip from "@/components/Tooltip";
import type { AnnotationStatus } from "@/types";

const statusIcons: Record<AnnotationStatus | string, React.ReactNode> = {
  verified: <VerifiedIcon className="w-6 h-6 text-blue-500" />,
  rejected: <CloseIcon className="w-6 h-6 text-red-500" />,
  assigned: <HelpIcon className="w-6 h-6 text-amber-500" />,
  completed: <CheckIcon className="w-6 h-6 text-emerald-500" />,
  "no": <NoIcon className="w-6 h-6 text-slate-500" />,
};

const statusTooltips: Record<AnnotationStatus | string, string> = {
  verified: "Verified",
  rejected: "Rejected",
  assigned: "Unsure",
  completed: "Accepted",
  "no": "No State",
};

// Define the desired order for status display
const statusOrder = ["completed", "assigned", "rejected", "verified", "no"] as const;

interface ExportStatusSelectionProps {
  allStatusOptions: readonly (AnnotationStatus | string)[];
  selectedStatuses: (AnnotationStatus | string)[];
  onStatusToggle: (status: AnnotationStatus | string) => void;
}

export default function ExportStatusSelection({
  allStatusOptions,
  selectedStatuses,
  onStatusToggle,
}: ExportStatusSelectionProps) {
  return (
    <Card>
      <div>
        <H3>Select Task Statuses</H3>
        <p className="text-stone-500">Select status badges that should be exported.</p>
        <div className="flex flex-row gap-4">
          {[...allStatusOptions]
            .sort((a, b) => {
              const indexA = statusOrder.indexOf(a as any);
              const indexB = statusOrder.indexOf(b as any);
              // If status is not in statusOrder, put it at the end
              const orderA = indexA === -1 ? statusOrder.length : indexA;
              const orderB = indexB === -1 ? statusOrder.length : indexB;
              return orderA - orderB;
            })
            .map(status => (
              <Tooltip
                key={status}
                tooltip={statusTooltips[status as keyof typeof statusTooltips]}
                placement="bottom"
              >
                <button
                  className={`p-2 rounded-md ${selectedStatuses.includes(status)
                    ? "bg-stone-200 dark:bg-stone-700"
                    : "hover:bg-stone-100 dark:hover:bg-stone-800"
                    }`}
                  onClick={() => onStatusToggle(status)}
                >
                  {statusIcons[status as keyof typeof statusIcons]}
                </button>
              </Tooltip>
            ))}
        </div>
      </div>
    </Card>
  );
}
