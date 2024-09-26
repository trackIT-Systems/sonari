import React, { useState, useCallback } from "react";
import Card from "@/components/Card";
import { CloseIcon } from "@/components/icons";
import Button from "@/components/Button";

interface DateRangeFilterProps {
  onChange: (value: {
    start_date?: Date | null | undefined;
    end_date?: Date | null | undefined;
    start_time?: Date | null | undefined;
    end_time?: Date | null | undefined 
  }) => void;
}

export default function DateRangeFilter({ onChange }: DateRangeFilterProps) {
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [endTime, setEndTime] = useState<Date | null>(null);

  const handleApply = useCallback(() => {
    onChange({ start_date: startDate, end_date: endDate, start_time: startTime, end_time: endTime });
  }, [startDate, endDate, startTime, endTime, onChange]);

  const handleClear = useCallback(() => {
    setStartDate(null);
    setEndDate(null);
    setStartTime(null);
    setEndTime(null);
    onChange({ start_date: null, end_date: null, start_time: null, end_time: null });
  }, [onChange]);

  const handleStartDateChange = useCallback((value: { date?: Date | null | undefined }) => {
    setStartDate(value.date || null);
  }, []);

  const handleEndDateChange = useCallback((value: { date?: Date | null | undefined }) => {
    setEndDate(value.date || null);
  }, []);

  const handleStartTimeChange = useCallback((value: { time?: Date | null | undefined }) => {
    setStartTime(value.time || null);
  }, []);

  const handleEndTimeChange = useCallback((value: { time?: Date | null | undefined }) => {
    setEndTime(value.time || null);
  }, []);

  return (
    <Card className="bg-stone-800 p-4">
      <div className="flex flex-col space-y-4">
        <div className="flex space-x-2">
          <RecordingDateFilter
            date={startDate}
            onChange={handleStartDateChange}
            label="Start Date"
          />
          <RecordingTimeFilter
            time={startTime}
            onChange={handleStartTimeChange}
            label="Start Time"
          />
        </div>
        <div className="flex space-x-2">
          <RecordingDateFilter
            date={endDate}
            onChange={handleEndDateChange}
            label="End Date"
          />
          <RecordingTimeFilter
            time={endTime}
            onChange={handleEndTimeChange}
            label="End Time"
          />
        </div>
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
  date?: Date | null | undefined;
  onChange: (value: { date?: Date | null | undefined }) => void;
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

function RecordingTimeFilter({
  time,
  onChange,
  label,
}: {
  time?: Date | null | undefined;
  onChange: (value: { time?: Date | null | undefined }) => void;
  label: string;
}) {
  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const [hours, minutes] = e.target.value.split(':').map(Number);
    const newTime = new Date();
    newTime.setHours(hours, minutes, 0, 0);
    onChange({ time: newTime });
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
      </label>
      <input
        type="time"
        value={time ? `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}` : ''}
        onChange={handleTimeChange}
        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}