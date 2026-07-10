import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  OPERATORS_BY_TYPE,
  ReportDataset,
  ReportField,
  ReportGranularity,
  ReportMetricFn,
  ReportOperator,
} from './report-datasets';

/**
 * Pure query-compilation helpers for the Custom Report Builder. No DB access
 * here — the service feeds these into `Model.aggregate` / `Model.find`. Keeping
 * them side-effect free makes the filter/operator matrix unit-testable.
 */

export interface ReportFilterInput {
  field: string;
  operator: ReportOperator;
  value?: unknown;
}

export interface ReportDateRangeInput {
  field?: string;
  from?: string;
  to?: string;
}

export interface ReportMetricInput {
  fn: ReportMetricFn;
  field?: string;
  /** Output key; defaults to `${fn}_${field}` or `count`. */
  alias?: string;
}

/** Escape user input so it can be safely embedded in a RegExp. */
function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Safe string form of an unknown value (objects become JSON, never `[object Object]`). */
function asText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return `${value}`;
  }
  return JSON.stringify(value) ?? '';
}

function getFieldOrThrow(dataset: ReportDataset, key: string): ReportField {
  const field = dataset.fields.find((f) => f.key === key);
  if (!field) {
    throw new BadRequestException(
      `Unknown field "${key}" for dataset "${dataset.key}"`,
    );
  }
  return field;
}

/** Coerce a single scalar to the field's underlying storage type. */
function coerceScalar(field: ReportField, value: unknown): unknown {
  if (value === null || value === undefined) {
    throw new BadRequestException(`Missing value for field "${field.key}"`);
  }

  if (field.isObjectId) {
    if (!Types.ObjectId.isValid(asText(value))) {
      throw new BadRequestException(`Invalid id for field "${field.key}"`);
    }
    return new Types.ObjectId(asText(value));
  }

  switch (field.type) {
    case 'number': {
      const n = Number(value);
      if (Number.isNaN(n)) {
        throw new BadRequestException(
          `"${asText(value)}" is not a number for field "${field.key}"`,
        );
      }
      return n;
    }
    case 'date': {
      const d = new Date(value as string);
      if (Number.isNaN(d.getTime())) {
        throw new BadRequestException(
          `"${asText(value)}" is not a date for field "${field.key}"`,
        );
      }
      return d;
    }
    case 'boolean': {
      if (typeof value === 'boolean') return value;
      if (value === 'true') return true;
      if (value === 'false') return false;
      throw new BadRequestException(
        `"${asText(value)}" is not a boolean for field "${field.key}"`,
      );
    }
    case 'enum': {
      const str = asText(value);
      if (field.enumValues && !field.enumValues.includes(str)) {
        throw new BadRequestException(
          `"${str}" is not a valid value for "${field.key}"`,
        );
      }
      return str;
    }
    default:
      return asText(value);
  }
}

/** Compile one filter clause into a `{ field: condition }` object. */
export function compileFilter(
  dataset: ReportDataset,
  filter: ReportFilterInput,
): Record<string, unknown> {
  const field = getFieldOrThrow(dataset, filter.field);
  const allowed = OPERATORS_BY_TYPE[field.type];
  if (!allowed.includes(filter.operator)) {
    throw new BadRequestException(
      `Operator "${filter.operator}" is not allowed on ${field.type} field "${field.key}"`,
    );
  }

  switch (filter.operator) {
    case 'eq':
      return { [field.key]: coerceScalar(field, filter.value) };
    case 'ne':
      return { [field.key]: { $ne: coerceScalar(field, filter.value) } };
    case 'gt':
      return { [field.key]: { $gt: coerceScalar(field, filter.value) } };
    case 'gte':
      return { [field.key]: { $gte: coerceScalar(field, filter.value) } };
    case 'lt':
      return { [field.key]: { $lt: coerceScalar(field, filter.value) } };
    case 'lte':
      return { [field.key]: { $lte: coerceScalar(field, filter.value) } };
    case 'contains': {
      const str = asText(filter.value).trim();
      if (!str) {
        throw new BadRequestException(
          `"contains" needs a non-empty value for "${field.key}"`,
        );
      }
      return { [field.key]: new RegExp(escapeRegExp(str), 'i') };
    }
    case 'in':
    case 'nin': {
      if (!Array.isArray(filter.value) || filter.value.length === 0) {
        throw new BadRequestException(
          `"${filter.operator}" needs a non-empty array for "${field.key}"`,
        );
      }
      const values = filter.value.map((v) => coerceScalar(field, v));
      return {
        [field.key]: { [filter.operator === 'in' ? '$in' : '$nin']: values },
      };
    }
    case 'between': {
      if (!Array.isArray(filter.value) || filter.value.length !== 2) {
        throw new BadRequestException(
          `"between" needs [min, max] for "${field.key}"`,
        );
      }
      return {
        [field.key]: {
          $gte: coerceScalar(field, filter.value[0]),
          $lte: coerceScalar(field, filter.value[1]),
        },
      };
    }
    case 'exists': {
      const exists =
        filter.value === undefined
          ? true
          : coerceScalar(
              { ...field, type: 'boolean', isObjectId: false },
              filter.value,
            );
      return { [field.key]: { $exists: exists as boolean } };
    }
    default:
      throw new BadRequestException('Unsupported operator');
  }
}

/** Compile an optional date range onto the given (or default) date field. */
export function compileDateRange(
  dataset: ReportDataset,
  range: ReportDateRangeInput | undefined,
): Record<string, unknown> | null {
  if (!range || (!range.from && !range.to)) return null;

  const key = range.field ?? dataset.defaultDateField;
  const field = getFieldOrThrow(dataset, key);
  if (field.type !== 'date') {
    throw new BadRequestException(`"${key}" is not a date field`);
  }

  const condition: Record<string, unknown> = {};
  if (range.from) condition.$gte = coerceScalar(field, range.from);
  if (range.to) condition.$lte = coerceScalar(field, range.to);
  return { [key]: condition };
}

/** Merge condition objects into a single Mongo filter (`$and` when needed). */
export function combineConditions(
  conditions: Array<Record<string, unknown> | null | undefined>,
): Record<string, unknown> {
  const active = conditions.filter(
    (c): c is Record<string, unknown> => !!c && Object.keys(c).length > 0,
  );
  if (active.length === 0) return {};
  if (active.length === 1) return active[0];
  return { $and: active };
}

/** Build the full `$match` for a report from filters + date range. */
export function buildMatch(
  dataset: ReportDataset,
  filters: ReportFilterInput[] | undefined,
  dateRange: ReportDateRangeInput | undefined,
  extra?: Record<string, unknown> | null,
): Record<string, unknown> {
  const compiled = (filters ?? []).map((f) => compileFilter(dataset, f));
  compiled.push(compileDateRange(dataset, dateRange) ?? {});
  return combineConditions([...compiled, extra]);
}

/** Build the aggregation `_id` expression for a groupBy dimension. */
export function buildGroupId(
  dataset: ReportDataset,
  groupBy: string,
  granularity?: ReportGranularity,
): unknown {
  const field = getFieldOrThrow(dataset, groupBy);
  if (!field.groupable) {
    throw new BadRequestException(`Field "${groupBy}" cannot be grouped`);
  }

  if (field.type === 'date' && granularity) {
    return {
      $dateTrunc: { date: `$${field.key}`, unit: granularity },
    };
  }
  return `$${field.key}`;
}

/** Build `$group` metric accumulators; validates fn/field compatibility. */
export function buildMetrics(
  dataset: ReportDataset,
  metrics: ReportMetricInput[],
): { accumulators: Record<string, unknown>; aliases: string[] } {
  if (metrics.length === 0) {
    throw new BadRequestException('At least one metric is required');
  }

  const accumulators: Record<string, unknown> = {};
  const aliases: string[] = [];

  for (const metric of metrics) {
    const alias =
      metric.alias?.trim() ||
      (metric.fn === 'count' ? 'count' : `${metric.fn}_${metric.field ?? ''}`);

    if (accumulators[alias]) {
      throw new BadRequestException(`Duplicate metric alias "${alias}"`);
    }

    if (metric.fn === 'count') {
      accumulators[alias] = { $sum: 1 };
    } else {
      if (!metric.field) {
        throw new BadRequestException(`Metric "${metric.fn}" requires a field`);
      }
      const field = getFieldOrThrow(dataset, metric.field);
      if (!field.aggregatable) {
        throw new BadRequestException(
          `Field "${metric.field}" is not numeric and cannot be aggregated`,
        );
      }
      accumulators[alias] = { [`$${metric.fn}`]: `$${field.key}` };
    }
    aliases.push(alias);
  }

  return { accumulators, aliases };
}

/** Validate a sort field against the dataset and return a Mongo sort spec. */
export function buildSort(
  dataset: ReportDataset,
  sortBy: string | undefined,
  sortOrder: 'asc' | 'desc' | undefined,
): Record<string, 1 | -1> {
  const direction: 1 | -1 = sortOrder === 'asc' ? 1 : -1;
  const key = sortBy ?? dataset.defaultDateField;
  const field = getFieldOrThrow(dataset, key);
  if (!field.sortable) {
    throw new BadRequestException(`Field "${key}" is not sortable`);
  }
  return { [key]: direction, _id: direction };
}
