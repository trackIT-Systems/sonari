import Card from "@/components/Card";
import { H3 } from "@/components/Headings";
import { InputGroup } from "@/components/inputs/index";
import Select from "@/components/inputs/Select";
import type { Option } from "@/components/inputs/Select";

type TimePeriodType = 'predefined' | 'custom';
type PredefinedPeriod = 'second' | 'minute' | 'hour' | 'night' | 'day' | 'week' | 'overall';
type TimeUnit = 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years';

interface ExportTimePeriodConfigurationProps {
  timePeriodType: TimePeriodType;
  predefinedPeriod: PredefinedPeriod;
  customPeriodValue: number;
  customPeriodUnit: TimeUnit;
  onTimePeriodTypeChange: (value: TimePeriodType) => void;
  onPredefinedPeriodChange: (value: PredefinedPeriod) => void;
  onCustomPeriodValueChange: (value: number) => void;
  onCustomPeriodUnitChange: (value: TimeUnit) => void;
}

export default function ExportTimePeriodConfiguration({
  timePeriodType,
  predefinedPeriod,
  customPeriodValue,
  customPeriodUnit,
  onTimePeriodTypeChange,
  onPredefinedPeriodChange,
  onCustomPeriodValueChange,
  onCustomPeriodUnitChange,
}: ExportTimePeriodConfigurationProps) {
  
  const predefinedPeriodOptions: Option<PredefinedPeriod>[] = [
    { id: 'second', label: 'Second', value: 'second' },
    { id: 'minute', label: 'Minute', value: 'minute' },
    { id: 'hour', label: 'Hour', value: 'hour' },
    { id: 'night', label: 'Night (6PM-6AM)', value: 'night' },
    { id: 'day', label: 'Day (24 hours)', value: 'day' },
    { id: 'week', label: 'Week', value: 'week' },
    { id: 'overall', label: 'Overall (entire project)', value: 'overall' },
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
        <H3 className="text-lg">
          Time Period Configuration
        </H3>
        
        <p className="text-sm text-stone-500 dark:text-stone-400 mb-4">
          Configure the time intervals for counting events. Events will be grouped and counted within each time period.
        </p>

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
              <div className="ml-6 flex items-center space-x-2">
                <input
                  type="number"
                  min="1"
                  value={customPeriodValue}
                  onChange={(e) => onCustomPeriodValueChange(parseInt(e.target.value) || 1)}
                  className="w-20 px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-md bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                />
                <Select
                  options={timeUnitOptions}
                  selected={timeUnitOptions.find(opt => opt.value === customPeriodUnit) || timeUnitOptions[1]}
                  onChange={(value) => onCustomPeriodUnitChange(value as TimeUnit)}
                />
              </div>
            )}
          </div>
        </InputGroup>

      </div>
    </Card>
  );
}

export type { TimePeriodType, PredefinedPeriod, TimeUnit };
