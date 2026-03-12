import React, { useState, useCallback } from "react";
import Card from "@/components/Card";
import { CloseIcon, CheckIcon } from "@/components/icons";
import Button from "@/components/Button";

interface DateRangeFilterProps {
  onChange: (value: {
    start_date?: Date | null | undefined;
    end_date?: Date | null | undefined;
    start_time?: Date | null | undefined;
    end_time?: Date | null | undefined 
  }) => void;
}



const TIME_ONLY_REGEX = /^\d{1,2}:\d{2}(:\d{2})?$/;

function parseTimeOnly(s: string): Date {
  const [h, m, sec = "0"] = s.split(":");
  return new Date(1970, 0, 1, parseInt(h, 10), parseInt(m, 10), parseInt(sec, 10));
}

// Coerce value (e.g. from URL/state) to Date for formatting/display; time-only "HH:mm" uses a fixed date
function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string" && TIME_ONLY_REGEX.test(value)) return parseTimeOnly(value);
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

// Helper functions to format date and time (accept Date, ISO string, time-only "HH:mm", or timestamp from URL/state)
export function formatDate(date: Date | string | number | null | undefined): string {
  if (date != null && typeof date === "string" && TIME_ONLY_REGEX.test(date)) return "Any Date,";
  const d = toDate(date);
  if (!d) return "Any Date,";
  return `${d.toLocaleDateString()},`;
}

export function formatTime(date: Date | string | number | null | undefined): string {
  const d = toDate(date);
  if (!d) return "Any Time";
  return d.toLocaleTimeString();
}

function toTimeOnlyString(date: Date | string | null | undefined): string | null {
  if (date == null) return null;
  const d = typeof date === "string" ? new Date(date) : date instanceof Date ? date : null;
  if (!d || isNaN(d.getTime())) return null;
  const h = d.getHours();
  const m = d.getMinutes();
  const s = d.getSeconds();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return s ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}`;
}

/** Normalize date_range for preset storage: when date is null, store time as "HH:mm" so preset doesn't carry current date. */
export function normalizeDateRangeForPreset<T extends { date_range?: unknown }>(filter: T): T {
  const dr = filter.date_range;
  if (dr == null) return filter;
  const entries = Array.isArray(dr) ? dr : [dr];
  const normalized = entries.map((entry: Record<string, unknown>) => {
    const startDate = entry.start_date;
    const endDate = entry.end_date;
    const startTime = entry.start_time;
    const endTime = entry.end_time;
    return {
      ...entry,
      start_time: startDate == null && startTime != null ? toTimeOnlyString(startTime as Date) ?? startTime : startTime,
      end_time: endDate == null && endTime != null ? toTimeOnlyString(endTime as Date) ?? endTime : endTime,
    };
  });
  return { ...filter, date_range: Array.isArray(dr) ? normalized : normalized[0] };
}

export function formatDateForAPI(date: Date | string | number | null | undefined): string | undefined {
  if (date == null) return undefined;
  if (typeof date === "string") {
    if (TIME_ONLY_REGEX.test(date)) {
      const [h, m, sec = "0"] = date.split(":");
      const pad = (n: number) => n.toString().padStart(2, "0");
      return `1970-01-01T${pad(parseInt(h, 10))}:${pad(parseInt(m, 10))}:${pad(parseInt(sec, 10))}.000Z`;
    }
    return date;
  }
  if (typeof date === "number") return new Date(date).toISOString();
  return date.toISOString();
}

export function DateRangeFilter({ onChange }: DateRangeFilterProps) {
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [endTime, setEndTime] = useState<Date | null>(null);

  const handleApply = useCallback(() => {
    onChange({ start_date: startDate, end_date: endDate, start_time: startTime, end_time: endTime });
  }, [startDate, endDate, startTime, endTime, onChange]);

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
            <CheckIcon className="mr-1 w-5 h-5 group-hover:stroke-3" />
            Apply
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