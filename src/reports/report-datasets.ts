import {
  ACTIVITY_DIRECTIONS,
  ACTIVITY_PRIORITIES,
  ACTIVITY_STATUSES,
  ACTIVITY_TYPES,
  Activity,
  RELATED_TYPES,
} from '../activities/activity.schema';
import { Customer } from '../customers/customer.schema';
import { LEAD_SOURCES, LEAD_STATUSES, Lead } from '../leads/lead.schema';
import {
  OPPORTUNITY_STAGES,
  Opportunity,
} from '../opportunities/opportunity.schema';
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_TYPES,
  Ticket,
} from '../tickets/ticket.schema';

/**
 * Field types drive which operators the Custom Report Builder allows and how a
 * value is coerced before it hits Mongo. Keep this file the single source of
 * truth: the builder UI, the query engine, and validation all read from it.
 */
export type ReportFieldType = 'string' | 'number' | 'date' | 'enum' | 'boolean';

export interface ReportField {
  /** Mongo field path (also the value the client sends). */
  key: string;
  label: string;
  type: ReportFieldType;
  /** Allowed values when `type === 'enum'`. */
  enumValues?: readonly string[];
  /** Stored as an ObjectId — filter values are cast before matching. */
  isObjectId?: boolean;
  /** Usable as a `groupBy` dimension. */
  groupable?: boolean;
  /** Numeric target for `sum`/`avg`/`min`/`max` metrics. */
  aggregatable?: boolean;
  /** Selectable as a sort key / row column. */
  sortable?: boolean;
}

export interface ReportDataset {
  /** Stable key sent by the client (e.g. `opportunities`). */
  key: string;
  label: string;
  /** Mongoose model name — the engine resolves the injected model from this. */
  model: string;
  description: string;
  fields: ReportField[];
  /** Columns returned by default in row mode. */
  defaultColumns: string[];
  /** Date field used when a report supplies a date range without a field. */
  defaultDateField: string;
}

const CUSTOMER_STATUSES = ['active', 'inactive', 'prospect'] as const;

/** Ownership/routing fields shared by every visibility-scoped collection. */
const ownershipFields = (): ReportField[] => [
  {
    key: 'assignedToId',
    label: 'Owner',
    type: 'string',
    groupable: true,
    sortable: true,
  },
  {
    key: 'assignedTeamId',
    label: 'Team',
    type: 'string',
    isObjectId: true,
    groupable: true,
    sortable: true,
  },
  { key: 'createdBy', label: 'Created By', type: 'string', groupable: true },
  {
    key: 'createdAt',
    label: 'Created',
    type: 'date',
    groupable: true,
    sortable: true,
  },
  {
    key: 'updatedAt',
    label: 'Updated',
    type: 'date',
    groupable: true,
    sortable: true,
  },
];

export const REPORT_DATASETS: ReportDataset[] = [
  {
    key: 'opportunities',
    label: 'Opportunities',
    model: Opportunity.name,
    description: 'Sales deals moving through the pipeline.',
    defaultColumns: [
      'name',
      'stage',
      'amount',
      'probability',
      'expectedCloseDate',
    ],
    defaultDateField: 'createdAt',
    fields: [
      { key: 'name', label: 'Deal Name', type: 'string', sortable: true },
      {
        key: 'amount',
        label: 'Amount',
        type: 'number',
        aggregatable: true,
        sortable: true,
      },
      {
        key: 'stage',
        label: 'Stage',
        type: 'enum',
        enumValues: OPPORTUNITY_STAGES,
        groupable: true,
        sortable: true,
      },
      {
        key: 'probability',
        label: 'Probability',
        type: 'number',
        aggregatable: true,
        sortable: true,
      },
      {
        key: 'expectedCloseDate',
        label: 'Expected Close',
        type: 'date',
        groupable: true,
        sortable: true,
      },
      {
        key: 'closedAt',
        label: 'Closed At',
        type: 'date',
        groupable: true,
        sortable: true,
      },
      { key: 'lostReason', label: 'Lost Reason', type: 'string' },
      ...ownershipFields(),
    ],
  },
  {
    key: 'leads',
    label: 'Leads',
    model: Lead.name,
    description: 'Prospects captured at the top of the funnel.',
    defaultColumns: [
      'firstName',
      'lastName',
      'email',
      'status',
      'source',
      'score',
    ],
    defaultDateField: 'createdAt',
    fields: [
      { key: 'firstName', label: 'First Name', type: 'string', sortable: true },
      { key: 'lastName', label: 'Last Name', type: 'string', sortable: true },
      { key: 'email', label: 'Email', type: 'string', sortable: true },
      {
        key: 'company',
        label: 'Company',
        type: 'string',
        groupable: true,
        sortable: true,
      },
      { key: 'jobTitle', label: 'Job Title', type: 'string' },
      {
        key: 'source',
        label: 'Source',
        type: 'enum',
        enumValues: LEAD_SOURCES,
        groupable: true,
        sortable: true,
      },
      {
        key: 'status',
        label: 'Status',
        type: 'enum',
        enumValues: LEAD_STATUSES,
        groupable: true,
        sortable: true,
      },
      {
        key: 'score',
        label: 'Score',
        type: 'number',
        aggregatable: true,
        sortable: true,
      },
      {
        key: 'estimatedValue',
        label: 'Estimated Value',
        type: 'number',
        aggregatable: true,
        sortable: true,
      },
      {
        key: 'convertedAt',
        label: 'Converted At',
        type: 'date',
        groupable: true,
        sortable: true,
      },
      ...ownershipFields(),
    ],
  },
  {
    key: 'customers',
    label: 'Customers',
    model: Customer.name,
    description: 'Won accounts and active customer records.',
    defaultColumns: ['firstName', 'lastName', 'email', 'company', 'status'],
    defaultDateField: 'createdAt',
    fields: [
      { key: 'firstName', label: 'First Name', type: 'string', sortable: true },
      { key: 'lastName', label: 'Last Name', type: 'string', sortable: true },
      { key: 'email', label: 'Email', type: 'string', sortable: true },
      { key: 'phone', label: 'Phone', type: 'string' },
      {
        key: 'company',
        label: 'Company',
        type: 'string',
        groupable: true,
        sortable: true,
      },
      { key: 'address', label: 'Address', type: 'string' },
      {
        key: 'status',
        label: 'Status',
        type: 'enum',
        enumValues: CUSTOMER_STATUSES,
        groupable: true,
        sortable: true,
      },
      ...ownershipFields(),
    ],
  },
  {
    key: 'activities',
    label: 'Activities',
    model: Activity.name,
    description: 'Tasks and logged communications.',
    defaultColumns: ['type', 'subject', 'status', 'priority', 'dueAt'],
    defaultDateField: 'createdAt',
    fields: [
      {
        key: 'type',
        label: 'Type',
        type: 'enum',
        enumValues: ACTIVITY_TYPES,
        groupable: true,
        sortable: true,
      },
      { key: 'subject', label: 'Subject', type: 'string', sortable: true },
      {
        key: 'status',
        label: 'Status',
        type: 'enum',
        enumValues: ACTIVITY_STATUSES,
        groupable: true,
        sortable: true,
      },
      {
        key: 'priority',
        label: 'Priority',
        type: 'enum',
        enumValues: ACTIVITY_PRIORITIES,
        groupable: true,
        sortable: true,
      },
      {
        key: 'direction',
        label: 'Direction',
        type: 'enum',
        enumValues: ACTIVITY_DIRECTIONS,
        groupable: true,
      },
      {
        key: 'relatedType',
        label: 'Related To',
        type: 'enum',
        enumValues: RELATED_TYPES,
        groupable: true,
      },
      {
        key: 'dueAt',
        label: 'Due',
        type: 'date',
        groupable: true,
        sortable: true,
      },
      { key: 'startAt', label: 'Start', type: 'date', sortable: true },
      {
        key: 'completedAt',
        label: 'Completed',
        type: 'date',
        groupable: true,
        sortable: true,
      },
      ...ownershipFields(),
    ],
  },
  {
    key: 'tickets',
    label: 'Tickets',
    model: Ticket.name,
    description: 'Support cases in the helpdesk.',
    defaultColumns: ['number', 'subject', 'type', 'status', 'priority'],
    defaultDateField: 'createdAt',
    fields: [
      { key: 'number', label: 'Number', type: 'string', sortable: true },
      { key: 'subject', label: 'Subject', type: 'string', sortable: true },
      {
        key: 'type',
        label: 'Type',
        type: 'enum',
        enumValues: TICKET_TYPES,
        groupable: true,
        sortable: true,
      },
      {
        key: 'status',
        label: 'Status',
        type: 'enum',
        enumValues: TICKET_STATUSES,
        groupable: true,
        sortable: true,
      },
      {
        key: 'priority',
        label: 'Priority',
        type: 'enum',
        enumValues: TICKET_PRIORITIES,
        groupable: true,
        sortable: true,
      },
      {
        key: 'firstResponseAt',
        label: 'First Response',
        type: 'date',
        sortable: true,
      },
      {
        key: 'resolvedAt',
        label: 'Resolved',
        type: 'date',
        groupable: true,
        sortable: true,
      },
      {
        key: 'closedAt',
        label: 'Closed',
        type: 'date',
        groupable: true,
        sortable: true,
      },
      ...ownershipFields(),
    ],
  },
];

export const REPORT_DATASET_KEYS = REPORT_DATASETS.map((d) => d.key);

export function getDataset(key: string): ReportDataset | undefined {
  return REPORT_DATASETS.find((d) => d.key === key);
}

/** Operators the builder exposes. Applicability is field-type dependent. */
export const REPORT_OPERATORS = [
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'nin',
  'contains',
  'between',
  'exists',
] as const;
export type ReportOperator = (typeof REPORT_OPERATORS)[number];

/** Metric functions for aggregated (grouped) reports. */
export const REPORT_METRIC_FNS = ['count', 'sum', 'avg', 'min', 'max'] as const;
export type ReportMetricFn = (typeof REPORT_METRIC_FNS)[number];

/** Date-bucket granularities for grouping a report by a date field. */
export const REPORT_GRANULARITIES = [
  'day',
  'week',
  'month',
  'quarter',
  'year',
] as const;
export type ReportGranularity = (typeof REPORT_GRANULARITIES)[number];

/** Operators each field type is allowed to use (validated in the engine). */
export const OPERATORS_BY_TYPE: Record<ReportFieldType, ReportOperator[]> = {
  string: ['eq', 'ne', 'contains', 'in', 'nin', 'exists'],
  number: [
    'eq',
    'ne',
    'gt',
    'gte',
    'lt',
    'lte',
    'between',
    'in',
    'nin',
    'exists',
  ],
  date: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between', 'exists'],
  enum: ['eq', 'ne', 'in', 'nin', 'exists'],
  boolean: ['eq', 'ne', 'exists'],
};
