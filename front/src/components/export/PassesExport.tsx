import { useEffect, useState } from "react";
import { AnnotationStatusSchema } from "@/schemas";
import Button from "@/components/Button";
import Card from "@/components/Card";
import { H3 } from "@/components/Headings";
import { CheckIcon, CloseIcon, VerifiedIcon, HelpIcon, NoIcon } from "@/components/icons";
import TagList from "@/components/tags/TagList";
import Tooltip from "@/components/Tooltip";
import Loading from "@/components/Loading";
import { InputGroup } from "@/components/inputs/index";
import Select from "@/components/inputs/Select";

import type { Tag, AnnotationStatus, AnnotationProject } from "@/types";
import api from "@/app/api";
import type { Option } from "@/components/inputs/Select";

const statusIcons: Record<AnnotationStatus | string, React.ReactNode> = {
  verified: <VerifiedIcon className="w-6 h-6 text-blue-500" />,
  rejected: <CloseIcon className="w-6 h-6 text-red-500" />,
  assigned: <HelpIcon className="w-6 h-6 text-amber-500" />,
  completed: <CheckIcon className="w-6 h-6 text-emerald-500" />,
  "no": <NoIcon className="w-6 h-6 text-slate-500" />,
};

const statusTooltips: Record<AnnotationStatus | string, string> = {
  verified: "Verified",
  rejected: "Reject",
  assigned: "Unsure",
  completed: "Accept",
  "no": "No State",
};

type TimePeriodType = 'predefined' | 'custom';
type PredefinedPeriod = 'second' | 'minute' | 'hour' | 'night' | 'day' | 'week' | 'overall';
type TimeUnit = 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years';

export default function PassesExport() {
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<(AnnotationStatus | string)[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<AnnotationProject[]>([]);
  
  // Combined array of schema statuses plus the special "no" option
  const allStatusOptions = [...Object.values(AnnotationStatusSchema.enum), "no"] as const;
  const [projectTags, setProjectTags] = useState<Tag[]>([]);
  const [availableProjects, setAvailableProjects] = useState<Option<AnnotationProject>[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  
  // Passes configuration
  const [eventCount, setEventCount] = useState<number>(2);
  const [timePeriodType, setTimePeriodType] = useState<TimePeriodType>('predefined');
  const [predefinedPeriod, setPredefinedPeriod] = useState<PredefinedPeriod>('minute');
  const [customPeriodValue, setCustomPeriodValue] = useState<number>(1);
  const [customPeriodUnit, setCustomPeriodUnit] = useState<TimeUnit>('minutes');
  
  // Date range filtering
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);

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

  useEffect(() => {
    async function fetchProjects() {
      try {
        const page = await api.annotationProjects.getMany({});
        const projects = page.items;
        const options = projects.map(project => ({
          id: project.uuid,
          label: project.name,
          value: project,
        }));
        setAvailableProjects(options);
      } catch (err) {
        console.error("Failed to fetch projects", err);
      }
    }

    fetchProjects();
  }, []);

  const availableProjectOptions = availableProjects.filter(p =>
    !selectedProjects.some(selected => selected.uuid === p.value.uuid)
  );

  const projectTagList: Tag[] = availableProjectOptions.map(p => ({
    key: "",
    value: p.value.name,
  }));

  const selectedProjectTags: Tag[] = selectedProjects.map(p => ({
    key: "",
    value: p.name,
  }));

  const handleTagSelect = (tag: Tag) => {
    setSelectedTags(prev => [...prev, tag]);
  };

  const handleTagDeselect = (tag: Tag) => {
    setSelectedTags(prev => prev.filter(t => t.key !== tag.key || t.value !== tag.value));
  };

  const handleSelectAllTags = () => {
    if (availableTags.length === 0) return;
    setSelectedTags(prev => {
      // Add only the tags that are not already selected
      const tagsToAdd = availableTags.filter(avail => !prev.some(sel => sel.key === avail.key && sel.value === avail.value));
      return [...prev, ...tagsToAdd];
    });
  };

  const handleProjectSelect = (tag: Tag) => {
    const project = availableProjects.find(p => p.label === tag.value)?.value;
    if (project && !selectedProjects.some(p => p.uuid === project.uuid)) {
      setSelectedProjects(prev => [...prev, project]);
    }
  };

  const handleProjectDeselect = (tag: Tag) => {
    setSelectedProjects(prev => prev.filter(p => p.name !== tag.value));
  };

  const handleStatusToggle = (status: AnnotationStatus | string) => {
    setSelectedStatuses(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  };

  const handleExport = async () => {
    if (selectedProjects.length === 0) return;
    setIsExporting(true);
    try {
      const tags = selectedTags.map(tag => `${tag.key}:${tag.value}`);
      const statusesToUse = selectedStatuses.length > 0
        ? selectedStatuses
        : Object.values(AnnotationStatusSchema.enum);

      // Prepare passes configuration
      const passesConfig = {
        eventCount,
        timePeriod: timePeriodType === 'predefined' 
          ? { type: 'predefined' as const, value: predefinedPeriod }
          : { type: 'custom' as const, value: customPeriodValue, unit: customPeriodUnit }
      };

      // Format dates for API (YYYY-MM-DD format)
      const formattedStartDate = startDate ? startDate.toISOString().split('T')[0] : undefined;
      const formattedEndDate = endDate ? endDate.toISOString().split('T')[0] : undefined;

      const { blob, filename } = await api.export.passes(
        selectedProjects,
        tags,
        statusesToUse,
        passesConfig.eventCount,
        passesConfig.timePeriod,
        formattedStartDate,
        formattedEndDate,
      );
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    if (selectedProjects.length === 0) {
      setProjectTags([]);
      setSelectedTags([]);
      setSelectedStatuses([]);
      return;
    }
    const mergedTags = selectedProjects.flatMap(p => p.tags ?? []);
    const uniqueTagMap = new Map<string, Tag>();
    for (const tag of mergedTags) {
      const key = `${tag.key}:${tag.value}`;
      if (!uniqueTagMap.has(key)) {
        uniqueTagMap.set(key, tag);
      }
    }
    setProjectTags(Array.from(uniqueTagMap.values()));
    setSelectedTags([]);
    setSelectedStatuses([]);
  }, [selectedProjects]);

  const availableTags = projectTags.filter(tag =>
    !selectedTags.some(t => t.key === tag.key && t.value === tag.value)
  );

  const isSelectionMade = selectedTags.length > 0 && selectedProjects.length > 0 && selectedStatuses.length > 0;

  return (
    <div className="flex flex-row gap-8">
      <div className="flex flex-col gap-y-6 max-w-prose">        
        <Card>
          <div>
            <H3 className="text-lg">Projects</H3>
            <p className="text-stone-500">Select projects to include in the export.</p>
          </div>
          <div className="grid grid-cols-2 gap-y-4 gap-x-14">
            <div className="col-span-2 md:col-span-1">
              <label className="block mb-2 font-medium text-stone-600 dark:text-stone-400">Available Projects</label>
              <small className="text-stone-500">Click a project to add it to the export selection.</small>
              <div className="py-2">
                <TagList autoFocus={true} tags={projectTagList} onClick={handleProjectSelect} />
              </div>
            </div>
            <div className="col-span-2 md:col-span-1">
              <label className="block mb-2 font-medium text-stone-600 dark:text-stone-400">Selected Projects</label>
              <small className="text-stone-500">Click a tag to remove it from the export selection.</small>
              <div className="py-2">
                <TagList autoFocus={false} tags={selectedProjectTags} onClick={handleProjectDeselect} />
              </div>
            </div>
          </div>
        </Card>
        
        <Card>
          <div>
            <H3 className="text-lg">Tags</H3>
            <p className="text-stone-500">Select tags that should be exported.</p>
          </div>
          <div className="grid grid-cols-2 gap-y-4 gap-x-14">
            <div className="col-span-2 md:col-span-1">
              <label className="block mb-2 font-medium text-stone-600 dark:text-stone-400">Available Tags</label>
              <div className="flex items-center justify-between">
                <small className="text-stone-500">Click on a tag to add it to the export selection.</small>
                <Button
                  variant="secondary"
                  mode="outline"
                  padding="px-3 py-1.5"
                  onClick={handleSelectAllTags}
                  disabled={availableTags.length === 0}
                >
                  Select all
                </Button>
              </div>
              <div className="py-2">
                <TagList autoFocus={false} tags={availableTags} onClick={handleTagSelect} />
              </div>
            </div>
            <div className="col-span-2 md:col-span-1">
              <label className="block mb-2 font-medium text-stone-600 dark:text-stone-400">Selected Tags</label>
              <small className="text-stone-500">Click on a tag to remove it from the export selection.</small>
              <div className="py-2">
                <TagList autoFocus={false} tags={selectedTags} onClick={handleTagDeselect} />
              </div>
            </div>
          </div>
        </Card>
        
        <Card>
          <div>
            <H3>Select Task Statuses</H3>
            <p className="text-stone-500">Select status badges that should be exported.</p>
            <div className="flex flex-row gap-4">
              {allStatusOptions.map(status => (
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
                    onClick={() => handleStatusToggle(status)}
                  >
                    {statusIcons[status as keyof typeof statusIcons]}
                  </button>
                </Tooltip>
              ))}
            </div>
          </div>
        </Card>

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
                onChange={(e) => setEventCount(Math.max(2, parseInt(e.target.value) || 2))}
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
                    onChange={(e) => setTimePeriodType(e.target.value as TimePeriodType)}
                    className="mr-2"
                  />
                  <span>Predefined period</span>
                </label>
                
                {timePeriodType === 'predefined' && (
                  <div className="ml-6">
                    <Select
                      options={predefinedPeriodOptions}
                      selected={predefinedPeriodOptions.find(opt => opt.value === predefinedPeriod) || predefinedPeriodOptions[0]}
                      onChange={(value) => setPredefinedPeriod(value as PredefinedPeriod)}
                    />
                  </div>
                )}

                <label className="flex items-center">
                  <input
                    type="radio"
                    name="period-type"
                    value="custom"
                    checked={timePeriodType === 'custom'}
                    onChange={(e) => setTimePeriodType(e.target.value as TimePeriodType)}
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
                        onChange={(e) => setCustomPeriodValue(Math.max(1, parseInt(e.target.value) || 1))}
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
                        onChange={(value) => setCustomPeriodUnit(value as TimeUnit)}
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

        {/* Date Range Filter Card */}
        <Card>
          <div>
            <H3 className="text-lg">Date Range Filter</H3>
            <p className="text-stone-500">
              Optionally filter passes to a specific date range.
            </p>
          </div>
          <div className="space-y-4">
            <InputGroup name="start-date" label="Start Date (Optional)">
              <input
                type="date"
                value={startDate ? startDate.toISOString().split('T')[0] : ''}
                onChange={(e) => setStartDate(e.target.valueAsDate)}
                className="w-full px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 dark:border-stone-600 dark:bg-stone-700 dark:text-stone-100"
              />
            </InputGroup>

            <InputGroup name="end-date" label="End Date (Optional)">
              <input
                type="date"
                value={endDate ? endDate.toISOString().split('T')[0] : ''}
                onChange={(e) => setEndDate(e.target.valueAsDate)}
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
      </div>

      <div className="w-96">
        <div className="sticky top-8">
          <Card>
            {isExporting ? (
              <Loading />
            ) : isSelectionMade ? (
              <>
                <H3>Summary</H3>
                <ul className="list-disc list-inside mb-4">
                  <li>
                    Selected projects: <span className="text-emerald-500">{selectedProjects.length}</span>
                  </li>
                  <li>
                    Selected tags: <span className="text-emerald-500">{selectedTags.length}</span>
                  </li>
                  <li>
                    Selected statuses: <span className="text-emerald-500">{selectedStatuses.length}</span>
                  </li>
                </ul>
                <p className="text-stone-500 mb-4">
                  Once satisfied with your selections, click the button below to export the passes.
                </p>
                <Button onClick={handleExport} className="w-full">
                  Export Passes
                </Button>
              </>
            ) : (
              <p className="text-stone-500">Select at least one project</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
