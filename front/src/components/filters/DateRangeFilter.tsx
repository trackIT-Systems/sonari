import React, { useState, useCallback } from "react";
import Card from "@/components/Card";
import { CloseIcon } from "@/components/icons";
import Button from "@/components/Button";

interface DateRangeFilterProps {
  onChange: (value: { start?: Date | null; end?: Date | null }) => void;
}

export default function DateRangeFilter({ onChange }: DateRangeFilterProps) {
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);

  const handleApply = useCallback(() => {
    let finalStartDate = startDate;
    let finalEndDate = endDate;

    if (startDate && !endDate) {
      finalEndDate = new Date(); // Current date
    } else if (!startDate && endDate) {
      finalStartDate = new Date(0); // Unix epoch
    }

    onChange({ start: finalStartDate, end: finalEndDate });
  }, [startDate, endDate, onChange]);

  const handleClear = useCallback(() => {
    setStartDate(null);
    setEndDate(null);
    onChange({ start: null, end: null });
  }, [onChange]);

  const handleStartDateChange = useCallback((value: { date?: Date | null }) => {
    setStartDate(value.date || null);
  }, []);

  const handleEndDateChange = useCallback((value: { date?: Date | null }) => {
    setEndDate(value.date || null);
  }, []);

  return (
    <Card className="bg-stone-800 p-4">
      <div className="flex flex-col space-y-4">
        <RecordingDateFilter
          date={startDate}
          onChange={handleStartDateChange}
          label="Start Date"
        />
        <RecordingDateFilter
          date={endDate}
          onChange={handleEndDateChange}
          label="End Date"
        />
        <div className="flex justify-between">
          <Button mode="text" variant="primary" onClick={handleApply}>
            Apply
          </Button>
          <Button mode="text" variant="danger" onClick={handleClear}>
            <CloseIcon className="inline-block mr-1 w-5 h-5" />
            Clear
          </Button>
        </div>
      </div>
    </Card>
  );
}

function RecordingDateFilter({
  date,
  onChange,
  label,
}: {
  date?: Date | null;
  onChange: (value: { date?: Date | null }) => void;
  label: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
      </label>
      <input
        type="date"
        value={date ? date.toISOString().split('T')[0] : ''}
        onChange={(e) => {
          e.stopPropagation();
          onChange({ date: e.target.valueAsDate });
        }}
        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
