import { AxiosInstance } from "axios";

import type { AnnotationProject } from "@/types";

const DEFAULT_ENDPOINTS = {
  multibase: "/api/v1/export/multibase/",
  dump: "/api/v1/export/dump/",
  passes: "/api/v1/export/passes/",
};

export function registerExportAPI(
  instance: AxiosInstance,
  endpoints: typeof DEFAULT_ENDPOINTS = DEFAULT_ENDPOINTS
) {
  async function exportMultiBase(
    annotationProjects: AnnotationProject[],
    tags: string[],
    statuses?: string[],
    includeNotes: boolean = true,
    dateFormat: string = "DD.MM.YYYY"
  ): Promise<{ blob: Blob; filename: string }> {
    const params = new URLSearchParams();
    
    // Add annotation project UUIDs
    annotationProjects.forEach(project => {
      params.append('annotation_project_uuids', project.uuid);
    });
    
    // Add tags
    tags.forEach(tag => {
      params.append('tags', tag);
    });
    
    // Add statuses if provided
    if (statuses && statuses.length > 0) {
      statuses.forEach(status => {
        params.append('statuses', status);
      });
    }
    
    // Add format-specific parameters
    params.append('include_notes', includeNotes.toString());
    params.append('date_format', dateFormat);

    const response = await instance.get(`${endpoints.multibase}?${params.toString()}`, {
      responseType: 'blob',
      withCredentials: true,
    });

    // Extract filename from Content-Disposition header
    const contentDisposition = response.headers['content-disposition'];
    let filename = 'multibase_export.xlsx'; // Default filename
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="?(.+)"?/i);
      if (filenameMatch) {
        filename = filenameMatch[1];
      }
    }

    // Create a Blob with the correct MIME type for XLSX
    const blob = new Blob([response.data], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });

    return { blob, filename };
  }

  async function exportDump(
    annotationProjects: AnnotationProject[],
  ): Promise<{ blob: Blob; filename: string }> {
    const params = new URLSearchParams();
    
    // Add annotation project UUIDs
    annotationProjects.forEach(project => {
      params.append('annotation_project_uuids', project.uuid);
    });

    const response = await instance.get(`${endpoints.dump}?${params.toString()}`, {
      responseType: 'blob',
      withCredentials: true,
    });

    // Extract filename from Content-Disposition header
    const contentDisposition = response.headers['content-disposition'];
    let filename = 'dump.csv'; // Default filename
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="?(.+)"?/i);
      if (filenameMatch) {
        filename = filenameMatch[1];
      }
    }

    // Create a Blob with the correct MIME type for XLSX
    const blob = new Blob([response.data], { 
      type: 'text/csv' 
    });

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
    const params = new URLSearchParams();
    
    // Add annotation project UUIDs
    annotationProjects.forEach(project => {
      params.append('annotation_project_uuids', project.uuid);
    });
    
    // Add tags
    tags.forEach(tag => {
      params.append('tags', tag);
    });
    
    // Add statuses if provided
    if (statuses && statuses.length > 0) {
      statuses.forEach(status => {
        params.append('statuses', status);
      });
    }
    
    // Add passes configuration
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

    // Add date range if provided
    if (startDate) {
      params.append('start_date', startDate);
    }
    if (endDate) {
      params.append('end_date', endDate);
    }
  
    const response = await instance.get(`${endpoints.passes}?${params.toString()}`, {
      responseType: 'blob',
      withCredentials: true,
    });

    // Extract filename from Content-Disposition header
    const contentDisposition = response.headers['content-disposition'];
    let filename = 'passes_export.csv'; // Default filename
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="?(.+)"?/i);
      if (filenameMatch) {
        filename = filenameMatch[1];
      }
    }

    // Create a Blob with the appropriate MIME type
    const blob = new Blob([response.data], { 
      type: response.headers['content-type'] || 'application/octet-stream'
    });

    return { blob, filename };
  }

  return {
    multibase: exportMultiBase,
    dump: exportDump,
    passes: exportPasses,
  } as const;
}
