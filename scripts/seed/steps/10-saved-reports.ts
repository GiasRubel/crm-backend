/**
 * Step 10 — saved report definitions.
 *
 * Running a saved report re-validates its definition through the same engine
 * that built it, so a made-up dataset, field, operator or metric fails loudly
 * at run time. Every definition below therefore uses names taken from
 * `src/reports/report-datasets.ts`:
 *
 *   datasets     opportunities | leads | customers | activities | tickets
 *   operators    eq ne gt gte lt lte in nin contains between exists
 *   metrics      count sum avg min max
 *   granularity  day week month quarter year
 *
 * Only fields flagged `groupable` are used as `groupBy`, and only fields
 * flagged `aggregatable` (opportunities.amount/probability,
 * leads.score/estimatedValue) are targets of sum/avg/min/max.
 */
import { Types } from 'mongoose';
import {
  SavedReport,
  SavedReportDocument,
} from '../../../src/reports/saved-report.schema';
import { VOLUMES } from '../config';
import { adminStaff, model, SeedContext } from '../context';
import { between, historyMoment, NOW, pick, shuffle } from '../rng';

interface ReportSpec {
  name: string;
  description: string;
  dataset: string;
  filters?: { field: string; operator: string; value?: unknown }[];
  dateRange?: { field?: string; from?: string; to?: string };
  groupBy?: string;
  groupByGranularity?: string;
  metrics?: { fn: string; field?: string; alias?: string }[];
  columns?: string[];
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  shared: boolean;
}

const REPORT_SPECS: ReportSpec[] = [
  {
    name: 'Pipeline value by stage',
    description:
      'Open pipeline broken down by stage, with deal count and total value.',
    dataset: 'opportunities',
    filters: [
      {
        field: 'stage',
        operator: 'in',
        value: ['discovery', 'proposal', 'negotiation'],
      },
    ],
    groupBy: 'stage',
    metrics: [
      { fn: 'count', alias: 'deals' },
      { fn: 'sum', field: 'amount', alias: 'pipelineValue' },
      { fn: 'avg', field: 'amount', alias: 'averageDeal' },
    ],
    sortBy: 'amount',
    sortOrder: 'desc',
    shared: true,
  },
  {
    name: 'Closed-won revenue by month',
    description: 'Monthly won revenue trend across the full history.',
    dataset: 'opportunities',
    filters: [{ field: 'stage', operator: 'eq', value: 'closed_won' }],
    groupBy: 'closedAt',
    groupByGranularity: 'month',
    metrics: [
      { fn: 'sum', field: 'amount', alias: 'revenue' },
      { fn: 'count', alias: 'dealsWon' },
    ],
    shared: true,
  },
  {
    name: 'Win rate by owner',
    description:
      'Closed deals per rep — pair with the loss report to read win rate.',
    dataset: 'opportunities',
    filters: [
      { field: 'stage', operator: 'in', value: ['closed_won', 'closed_lost'] },
    ],
    groupBy: 'assignedToId',
    metrics: [
      { fn: 'count', alias: 'closedDeals' },
      { fn: 'sum', field: 'amount', alias: 'closedValue' },
    ],
    sortBy: 'amount',
    sortOrder: 'desc',
    shared: true,
  },
  {
    name: 'Large open deals',
    description: 'Every open opportunity above 50k, most valuable first.',
    dataset: 'opportunities',
    filters: [
      { field: 'amount', operator: 'gte', value: 50000 },
      { field: 'stage', operator: 'nin', value: ['closed_won', 'closed_lost'] },
    ],
    columns: [
      'name',
      'stage',
      'amount',
      'probability',
      'expectedCloseDate',
      'assignedToId',
    ],
    sortBy: 'amount',
    sortOrder: 'desc',
    shared: true,
  },
  {
    name: 'Deals slipping this quarter',
    description: 'Open deals whose expected close date has already passed.',
    dataset: 'opportunities',
    filters: [
      { field: 'stage', operator: 'nin', value: ['closed_won', 'closed_lost'] },
      {
        field: 'expectedCloseDate',
        operator: 'lt',
        value: new Date().toISOString(),
      },
    ],
    columns: ['name', 'stage', 'amount', 'expectedCloseDate', 'assignedToId'],
    sortBy: 'expectedCloseDate',
    sortOrder: 'asc',
    shared: false,
  },
  {
    name: 'Lead volume by source',
    description: 'Where leads come from, and how well each source scores.',
    dataset: 'leads',
    groupBy: 'source',
    metrics: [
      { fn: 'count', alias: 'leads' },
      { fn: 'avg', field: 'score', alias: 'averageScore' },
      { fn: 'sum', field: 'estimatedValue', alias: 'estimatedPipeline' },
    ],
    sortBy: 'score',
    sortOrder: 'desc',
    shared: true,
  },
  {
    name: 'Lead funnel by status',
    description: 'Count of leads at each funnel stage.',
    dataset: 'leads',
    groupBy: 'status',
    metrics: [{ fn: 'count', alias: 'leads' }],
    shared: true,
  },
  {
    name: 'Hot leads not yet converted',
    description: 'Leads scoring 70 or above that are still open.',
    dataset: 'leads',
    filters: [
      { field: 'score', operator: 'gte', value: 70 },
      { field: 'status', operator: 'nin', value: ['converted', 'unqualified'] },
    ],
    columns: [
      'firstName',
      'lastName',
      'email',
      'company',
      'score',
      'status',
      'assignedToId',
    ],
    sortBy: 'score',
    sortOrder: 'desc',
    shared: true,
  },
  {
    name: 'Conversions by month',
    description: 'Lead conversions over time.',
    dataset: 'leads',
    filters: [{ field: 'status', operator: 'eq', value: 'converted' }],
    groupBy: 'convertedAt',
    groupByGranularity: 'month',
    metrics: [{ fn: 'count', alias: 'conversions' }],
    shared: false,
  },
  {
    name: 'New customers by month',
    description: 'Customer acquisition trend.',
    dataset: 'customers',
    groupBy: 'createdAt',
    groupByGranularity: 'month',
    metrics: [{ fn: 'count', alias: 'newCustomers' }],
    shared: true,
  },
  {
    name: 'Customer book by owner',
    description: 'How many accounts each rep looks after.',
    dataset: 'customers',
    filters: [{ field: 'status', operator: 'eq', value: 'active' }],
    groupBy: 'assignedToId',
    metrics: [{ fn: 'count', alias: 'customers' }],
    sortBy: 'createdAt',
    sortOrder: 'desc',
    shared: true,
  },
  {
    name: 'Ticket volume by type',
    description: 'What the support desk actually spends its time on.',
    dataset: 'tickets',
    groupBy: 'type',
    metrics: [{ fn: 'count', alias: 'tickets' }],
    shared: true,
  },
  {
    name: 'Open tickets by priority',
    description: 'The live queue, weighted by urgency.',
    dataset: 'tickets',
    filters: [
      {
        field: 'status',
        operator: 'in',
        value: ['open', 'in_progress', 'waiting_on_customer'],
      },
    ],
    groupBy: 'priority',
    metrics: [{ fn: 'count', alias: 'openTickets' }],
    shared: true,
  },
  {
    name: 'Tickets awaiting a first response',
    description:
      'SLA watchlist: active tickets with no public staff reply yet.',
    dataset: 'tickets',
    filters: [
      { field: 'firstResponseAt', operator: 'exists', value: false },
      { field: 'status', operator: 'in', value: ['open', 'in_progress'] },
    ],
    columns: ['number', 'subject', 'type', 'priority', 'createdAt'],
    sortBy: 'createdAt',
    sortOrder: 'asc',
    shared: true,
  },
  {
    name: 'Overdue tasks by owner',
    description: 'Pending activities whose due date has passed.',
    dataset: 'activities',
    filters: [
      { field: 'status', operator: 'eq', value: 'pending' },
      { field: 'dueAt', operator: 'lt', value: new Date().toISOString() },
    ],
    groupBy: 'assignedToId',
    metrics: [{ fn: 'count', alias: 'overdue' }],
    sortBy: 'dueAt',
    sortOrder: 'asc',
    shared: true,
  },
  {
    name: 'Activity mix by type',
    description: 'Calls, emails and meetings logged per month.',
    dataset: 'activities',
    filters: [{ field: 'status', operator: 'eq', value: 'completed' }],
    groupBy: 'type',
    metrics: [{ fn: 'count', alias: 'logged' }],
    shared: false,
  },
];

export async function seedSavedReports(ctx: SeedContext): Promise<void> {
  const reportModel = model<SavedReportDocument>(ctx.app, SavedReport.name);

  const owners = adminStaff(ctx).length ? adminStaff(ctx) : ctx.pools.staff;
  const specs = shuffle(REPORT_SPECS).slice(0, VOLUMES.savedReports);

  const docs = specs.map((spec) => {
    const createdAt = historyMoment();
    return {
      _id: new Types.ObjectId(),
      organizationId: ctx.organizationId,
      name: spec.name,
      description: spec.description,
      dataset: spec.dataset,
      filters: spec.filters ?? [],
      dateRange: spec.dateRange,
      groupBy: spec.groupBy,
      groupByGranularity: spec.groupByGranularity,
      metrics: spec.metrics ?? [],
      columns: spec.columns ?? [],
      sortBy: spec.sortBy,
      sortOrder: spec.sortOrder,
      shared: spec.shared,
      createdBy: pick(owners).keycloakId,
      createdAt,
      updatedAt: between(createdAt, NOW),
    };
  });

  await ctx.insert('savedreports', reportModel, docs);
  ctx.logger.log(
    `  ${docs.length} saved reports (${docs.filter((d) => d.shared).length} shared)`,
  );
}
