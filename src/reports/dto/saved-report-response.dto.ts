import { ReportGranularity } from '../report-datasets';

export class SavedReportResponseDto {
  id: string;
  name: string;
  description?: string;
  dataset: string;
  filters: Array<{ field: string; operator: string; value?: unknown }>;
  dateRange?: { field?: string; from?: string; to?: string };
  groupBy?: string;
  groupByGranularity?: ReportGranularity;
  metrics: Array<{ fn: string; field?: string; alias?: string }>;
  columns: string[];
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  shared: boolean;
  createdBy: string;
  createdByName: string | null;
  /** True when the requesting user may edit/delete this report. */
  canManage: boolean;
  createdAt: string;
  updatedAt: string;
}
