import { ApiProperty } from '@nestjs/swagger';
import { ReportGranularity } from '../report-datasets';
import {
  ReportDateRangeDto,
  ReportFilterDto,
  ReportMetricDto,
} from './run-report.dto';

export class SavedReportResponseDto {
  id: string;
  name: string;
  description?: string;
  dataset: string;

  @ApiProperty({ type: () => ReportFilterDto, isArray: true })
  filters: ReportFilterDto[];

  @ApiProperty({ type: () => ReportDateRangeDto, required: false })
  dateRange?: ReportDateRangeDto;

  groupBy?: string;
  groupByGranularity?: ReportGranularity;

  @ApiProperty({ type: () => ReportMetricDto, isArray: true })
  metrics: ReportMetricDto[];

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
