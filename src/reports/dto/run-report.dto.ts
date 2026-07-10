import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  REPORT_DATASET_KEYS,
  REPORT_GRANULARITIES,
  REPORT_METRIC_FNS,
  REPORT_OPERATORS,
} from '../report-datasets';
import type {
  ReportGranularity,
  ReportMetricFn,
  ReportOperator,
} from '../report-datasets';

export class ReportFilterDto {
  @IsString()
  @MaxLength(80)
  field: string;

  @IsIn(REPORT_OPERATORS)
  operator: ReportOperator;

  /** Scalar or array — validated/coerced per field type in the engine. */
  @IsOptional()
  value?: unknown;
}

export class ReportDateRangeDto {
  @IsString()
  @MaxLength(80)
  @IsOptional()
  field?: string;

  @IsString()
  @IsOptional()
  from?: string;

  @IsString()
  @IsOptional()
  to?: string;
}

export class ReportMetricDto {
  @IsIn(REPORT_METRIC_FNS)
  fn: ReportMetricFn;

  @IsString()
  @MaxLength(80)
  @IsOptional()
  field?: string;

  @IsString()
  @MaxLength(80)
  @IsOptional()
  alias?: string;
}

/**
 * A Custom Report Builder request. When `metrics` is provided the engine runs
 * in **aggregate** mode (grouped rows + metric columns); otherwise it returns
 * paginated **rows** of the selected columns.
 */
export class RunReportDto {
  @IsIn(REPORT_DATASET_KEYS)
  dataset: string;

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ReportFilterDto)
  @IsOptional()
  filters?: ReportFilterDto[];

  @ValidateNested()
  @Type(() => ReportDateRangeDto)
  @IsOptional()
  dateRange?: ReportDateRangeDto;

  // ── Aggregate mode ────────────────────────────────────────────────────────
  @IsString()
  @MaxLength(80)
  @IsOptional()
  groupBy?: string;

  @IsIn(REPORT_GRANULARITIES)
  @IsOptional()
  groupByGranularity?: ReportGranularity;

  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ReportMetricDto)
  @IsOptional()
  metrics?: ReportMetricDto[];

  // ── Row mode ──────────────────────────────────────────────────────────────
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @IsOptional()
  columns?: string[];

  @IsString()
  @MaxLength(80)
  @IsOptional()
  sortBy?: string;

  @IsIn(['asc', 'desc'])
  @IsOptional()
  sortOrder?: 'asc' | 'desc';

  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 25;
}
