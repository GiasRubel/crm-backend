import { SavedReportResponseDto } from '../dto/saved-report-response.dto';
import { SavedReportDocument } from '../saved-report.schema';

export function toSavedReportResponseDto(
  report: SavedReportDocument,
  opts: { createdByName: string | null; canManage: boolean },
): SavedReportResponseDto {
  return {
    id: report._id.toString(),
    name: report.name,
    description: report.description,
    dataset: report.dataset,
    filters: report.filters.map((f) => ({
      field: f.field,
      operator: f.operator,
      value: f.value,
    })),
    dateRange: report.dateRange
      ? {
          field: report.dateRange.field,
          from: report.dateRange.from,
          to: report.dateRange.to,
        }
      : undefined,
    groupBy: report.groupBy,
    groupByGranularity: report.groupByGranularity,
    metrics: report.metrics.map((m) => ({
      fn: m.fn,
      field: m.field,
      alias: m.alias,
    })),
    columns: report.columns ?? [],
    sortBy: report.sortBy,
    sortOrder: report.sortOrder,
    shared: report.shared,
    createdBy: report.createdBy,
    createdByName: opts.createdByName,
    canManage: opts.canManage,
    createdAt: report.createdAt?.toISOString() ?? '',
    updatedAt: report.updatedAt?.toISOString() ?? '',
  };
}
