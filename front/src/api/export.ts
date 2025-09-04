import { AxiosInstance } from "axios";

import type { AnnotationProject } from "@/types";

const DEFAULT_ENDPOINTS = {
  multibase: "/api/v1/export/multibase/",
  dump: "/api/v1/export/dump/",
  passes: "/api/v1/export/passes/",
  stats: "/api/v1/export/stats/",
};

interface CommonExportParams {
  annotationProjects: AnnotationProject[];
  tags?: string[];
  statuses?: string[];
  startDate?: string;
  endDate?: string;
}

function buildCommonParams(params: CommonExportParams): URLSearchParams {
  const urlParams = new URLSearchParams();
  
  // Add annotation project UUIDs
  params.annotationProjects.forEach(project => {
    urlParams.append('annotation_project_uuids', project.uuid);
  });
  
  // Add tags if provided
  if (params.tags && params.tags.length > 0) {
    params.tags.forEach(tag => {
      urlParams.append('tags', tag);
    });
  }
  
  // Add statuses if provided
  if (params.statuses && params.statuses.length > 0) {
    params.statuses.forEach(status => {
      urlParams.append('statuses', status);
    });
  }

  // Add date range if provided
  if (params.startDate) {
    urlParams.append('start_date', params.startDate);
  }
  if (params.endDate) {
    urlParams.append('end_date', params.endDate);
  }

  return urlParams;
}

function extractFilenameFromResponse(response: any, defaultFilename: string): string {
  const contentDisposition = response.headers['content-disposition'];
  if (contentDisposition) {
    const filenameMatch = contentDisposition.match(/filename="?(.+)"?/i);
    if (filenameMatch) {
      return filenameMatch[1];
    }
  }
  return defaultFilename;
}

function createBlobFromResponse(response: any, mimeType: string): Blob {
  return new Blob([response.data], { type: mimeType });
}

export function registerExportAPI(
  instance: AxiosInstance,
  endpoints: typeof DEFAULT_ENDPOINTS = DEFAULT_ENDPOINTS
) {
  async function exportMultiBase(
    annotationProjects: AnnotationProject[],
    tags: string[],
    statuses?: string[],
    startDate?: string,
    endDate?: string,
  ): Promise<{ blob: Blob; filename: string }> {
    const params = buildCommonParams({
      annotationProjects,
      tags,
      statuses,
      startDate,
      endDate,
    });

    const response = await instance.get(`${endpoints.multibase}?${params.toString()}`, {
      responseType: 'blob',
      withCredentials: true,
    });

    const filename = extractFilenameFromResponse(response, 'multibase_export.xlsx');
    const blob = createBlobFromResponse(response, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    return { blob, filename };
  }

  async function exportDump(
    annotationProjects: AnnotationProject[],
  ): Promise<{ blob: Blob; filename: string }> {
    const params = buildCommonParams({
      annotationProjects,
    });

    const response = await instance.get(`${endpoints.dump}?${params.toString()}`, {
      responseType: 'blob',
      withCredentials: true,
    });

    const filename = extractFilenameFromResponse(response, 'dump.csv');
    const blob = createBlobFromResponse(response, 'text/csv');

    return { blob, filename };
  }

  async function exportPasses(
    annotationProjects: AnnotationProject[],
    tags: string[],
    statuses?: string[],
    eventCount?: number,
    timePeriod?: { type: 'predefined'; value: string } | { type: 'custom'; value: number; unit: string },
    startDate?: string,
    endDate?: string,
  ): Promise<{ blob: Blob; filename: string }> {
    const params = buildCommonParams({
      annotationProjects,
      tags,
      statuses,
      startDate,
      endDate,
    });
    
    // Add passes-specific configuration
    if (eventCount !== undefined) {
      params.append('event_count', eventCount.toString());
    }
    
    if (timePeriod) {
      params.append('time_period_type', timePeriod.type);
      if (timePeriod.type === 'predefined') {
        params.append('predefined_period', timePeriod.value);
      } else {
        params.append('custom_period_value', timePeriod.value.toString());
        params.append('custom_period_unit', timePeriod.unit);
      }
    }
  
    const response = await instance.get(`${endpoints.passes}?${params.toString()}`, {
      responseType: 'blob',
      withCredentials: true,
    });

    const filename = extractFilenameFromResponse(response, 'passes_export.csv');
    const blob = createBlobFromResponse(response, response.headers['content-type'] || 'application/octet-stream');

    return { blob, filename };
  }

  async function exportStats(
    annotationProjects: AnnotationProject[],
    tags: string[],
    statuses?: string[],
    startDate?: string,
    endDate?: string,
  ): Promise<{ blob: Blob; filename: string }> {
    const params = buildCommonParams({
      annotationProjects,
      tags,
      statuses,
      startDate,
      endDate,
    });
  
    const response = await instance.get(`${endpoints.stats}?${params.toString()}`, {
      responseType: 'blob',
      withCredentials: true,
    });

    const filename = extractFilenameFromResponse(response, 'stats_export.csv');
    const blob = createBlobFromResponse(response, response.headers['content-type'] || 'application/octet-stream');

    return { blob, filename };
  }

  return {
    multibase: exportMultiBase,
    dump: exportDump,
    passes: exportPasses,
    stat: exportStats,
  } as const;
}
