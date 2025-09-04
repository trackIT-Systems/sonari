import Card from "@/components/Card";
import { H3 } from "@/components/Headings";
import { InputGroup } from "@/components/inputs/index";
import Select from "@/components/inputs/Select";
import type { Option } from "@/components/inputs/Select";

type TimePeriodType = 'predefined' | 'custom';
type PredefinedPeriod = 'second' | 'minute' | 'hour' | 'night' | 'day' | 'week' | 'overall';
type TimeUnit = 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years';

interface ExportPassesConfigurationProps {
  eventCount: number;
  timePeriodType: TimePeriodType;
  predefinedPeriod: PredefinedPeriod;
  customPeriodValue: number;
  customPeriodUnit: TimeUnit;
  onEventCountChange: (value: number) => void;
  onTimePeriodTypeChange: (value: TimePeriodType) => void;
  onPredefinedPeriodChange: (value: PredefinedPeriod) => void;
  onCustomPeriodValueChange: (value: number) => void;
  onCustomPeriodUnitChange: (value: TimeUnit) => void;
}

export default function ExportPassesConfiguration({
  eventCount,
  timePeriodType,
  predefinedPeriod,
  customPeriodValue,
  customPeriodUnit,
  onEventCountChange,
  onTimePeriodTypeChange,
  onPredefinedPeriodChange,
  onCustomPeriodValueChange,
  onCustomPeriodUnitChange,
}: ExportPassesConfigurationProps) {
  // Options for predefined periods
  const predefinedPeriodOptions: Option<PredefinedPeriod>[] = [
    { id: 'second', label: 'Second', value: 'second' },
    { id: 'minute', label: 'Minute', value: 'minute' },
    { id: 'hour', label: 'Hour', value: 'hour' },
    { id: 'night', label: 'Night (6PM-6AM)', value: 'night' },
    { id: 'day', label: 'Day (24 hours)', value: 'day' },
    { id: 'week', label: 'Week', value: 'week' },
    { id: 'overall', label: 'Overall (entire dataset)', value: 'overall' },
  ];

  // Options for custom time units
  const timeUnitOptions: Option<TimeUnit>[] = [
    { id: 'seconds', label: 'Seconds', value: 'seconds' },
    { id: 'minutes', label: 'Minutes', value: 'minutes' },
    { id: 'hours', label: 'Hours', value: 'hours' },
    { id: 'days', label: 'Days', value: 'days' },
    { id: 'weeks', label: 'Weeks', value: 'weeks' },
    { id: 'months', label: 'Months', value: 'months' },
    { id: 'years', label: 'Years', value: 'years' },
  ];

  return (
    <Card>
      <div>
        <H3 className="text-lg">Passes Configuration</H3>
        <p className="text-stone-500">
          Configure how passes are calculated.
        </p>
      </div>
      <div className="space-y-4">
        {/* Event Count Input */}
        <InputGroup name="event-count" label="Number of Events (N)">
          <input
            type="number"
            min="1"
            value={eventCount}
            onChange={(e) => onEventCountChange(Math.max(2, parseInt(e.target.value) || 2))}
            className="w-full px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 dark:border-stone-600 dark:bg-stone-700 dark:text-stone-100"
            placeholder="Enter number of events"
          />
        </InputGroup>

        {/* Time Period Type Selection */}
        <InputGroup name="period-type" label="Time Period">
          <div className="space-y-3">
            <label className="flex items-center">
              <input
                type="radio"
                name="period-type"
                value="predefined"
                checked={timePeriodType === 'predefined'}
                onChange={(e) => onTimePeriodTypeChange(e.target.value as TimePeriodType)}
                className="mr-2"
              />
              <span>Predefined period</span>
            </label>

            {timePeriodType === 'predefined' && (
              <div className="ml-6">
                <Select
                  options={predefinedPeriodOptions}
                  selected={predefinedPeriodOptions.find(opt => opt.value === predefinedPeriod) || predefinedPeriodOptions[0]}
                  onChange={(value) => onPredefinedPeriodChange(value as PredefinedPeriod)}
                />
              </div>
            )}

            <label className="flex items-center">
              <input
                type="radio"
                name="period-type"
                value="custom"
                checked={timePeriodType === 'custom'}
                onChange={(e) => onTimePeriodTypeChange(e.target.value as TimePeriodType)}
                className="mr-2"
              />
              <span>Custom period</span>
            </label>

            {timePeriodType === 'custom' && (
              <div className="ml-6 flex gap-2 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-stone-600 dark:text-stone-400 mb-1">
                    Value
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={customPeriodValue}
                    onChange={(e) => onCustomPeriodValueChange(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 dark:border-stone-600 dark:bg-stone-700 dark:text-stone-100"
                    placeholder="1"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-stone-600 dark:text-stone-400 mb-1">
                    Unit
                  </label>
                  <Select
                    options={timeUnitOptions}
                    selected={timeUnitOptions.find(opt => opt.value === customPeriodUnit) || timeUnitOptions[0]}
                    onChange={(value) => onCustomPeriodUnitChange(value as TimeUnit)}
                  />
                </div>
              </div>
            )}
          </div>
        </InputGroup>

        {/* Pass Definition Preview */}
        <div className="bg-stone-100 dark:bg-stone-800 rounded-lg p-3">
          <p className="text-sm text-stone-600 dark:text-stone-400">
            <strong>Pass Definition:</strong> {eventCount} events per{' '}
            {timePeriodType === 'predefined'
              ? (predefinedPeriodOptions.find(p => p.value === predefinedPeriod)?.label || predefinedPeriod).toString().toLowerCase()
              : `${customPeriodValue} ${customPeriodUnit}`
            }
          </p>
        </div>
      </div>
    </Card>
  );
}

export type { TimePeriodType, PredefinedPeriod, TimeUnit };
