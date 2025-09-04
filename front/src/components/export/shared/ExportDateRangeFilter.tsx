import Card from "@/components/Card";
import { H3 } from "@/components/Headings";
import { InputGroup } from "@/components/inputs/index";

interface ExportDateRangeFilterProps {
  startDate: Date | null;
  endDate: Date | null;
  onStartDateChange: (date: Date | null) => void;
  onEndDateChange: (date: Date | null) => void;
}

export default function ExportDateRangeFilter({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: ExportDateRangeFilterProps) {
  return (
    <Card>
      <div>
        <H3 className="text-lg">Date Range Filter</H3>
        <p className="text-stone-500">
          Optionally filter recordings to a specific date range.
        </p>
      </div>
      <div className="space-y-4">
        <InputGroup name="start-date" label="Start Date (Optional)">
          <input
            type="date"
            value={startDate ? startDate.toISOString().split('T')[0] : ''}
            onChange={(e) => onStartDateChange(e.target.valueAsDate)}
            className="w-full px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 dark:border-stone-600 dark:bg-stone-700 dark:text-stone-100"
          />
        </InputGroup>

        <InputGroup name="end-date" label="End Date (Optional)">
          <input
            type="date"
            value={endDate ? endDate.toISOString().split('T')[0] : ''}
            onChange={(e) => onEndDateChange(e.target.valueAsDate)}
            className="w-full px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 dark:border-stone-600 dark:bg-stone-700 dark:text-stone-100"
          />
        </InputGroup>

        {(startDate || endDate) && (
          <div className="bg-stone-100 dark:bg-stone-800 rounded-lg p-3">
            <p className="text-sm text-stone-600 dark:text-stone-400">
              <strong>Date Filter:</strong>
              {startDate && endDate
                ? ` ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`
                : startDate
                  ? ` From ${startDate.toLocaleDateString()}`
                  : ` Until ${endDate?.toLocaleDateString()}`
              }
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
