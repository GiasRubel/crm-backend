import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import {
  ACTIVE_TICKET_STATUSES,
  Ticket,
  TicketDocument,
} from '../tickets/ticket.schema';
import { Activity, ActivityDocument } from '../activities/activity.schema';
import { Customer, CustomerDocument } from '../customers/customer.schema';
import { Lead, LeadDocument } from '../leads/lead.schema';
import {
  CLOSED_STAGES,
  OPPORTUNITY_STAGES,
  OPPORTUNITY_STAGES_OPEN,
  Opportunity,
  OpportunityDocument,
  OpportunityStage,
} from '../opportunities/opportunity.schema';
import { AppRole } from '../users/app-role.enum';
import { UsersService } from '../users/users.service';
import { TeamsService } from '../teams/teams.service';
import { CreateSavedReportDto } from './dto/create-saved-report.dto';
import {
  BreakdownSliceDto,
  DashboardResponseDto,
  RepPerformanceDto,
  RevenuePointDto,
} from './dto/dashboard-response.dto';
import { ReportAggregateRow, ReportResultDto } from './dto/report-result.dto';
import { RunReportDto } from './dto/run-report.dto';
import { SavedReportResponseDto } from './dto/saved-report-response.dto';
import { TeamPerformanceResponseDto } from './dto/team-performance.dto';
import { toSavedReportResponseDto } from './mappers/saved-report.mapper';
import {
  getDataset,
  OPERATORS_BY_TYPE,
  REPORT_DATASETS,
  REPORT_GRANULARITIES,
  REPORT_METRIC_FNS,
  REPORT_OPERATORS,
  ReportDataset,
} from './report-datasets';
import {
  buildGroupId,
  buildMatch,
  buildMetrics,
  buildSort,
} from './report-query.util';
import { SavedReport, SavedReportDocument } from './saved-report.schema';

/** Human labels for the lead source breakdown pie. */
const LEAD_SOURCE_LABELS: Record<string, string> = {
  web_form: 'Web Form',
  api: 'API',
  manual: 'Manual',
  referral: 'Referral',
  event: 'Event',
  other: 'Other',
};

interface RepAggRow {
  _id: string | null;
  wonCount: number;
  wonValue: number;
  lostCount: number;
  openCount: number;
  openValue: number;
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  /** dataset.model (Mongoose model name) → injected model. */
  private readonly models: Record<string, Model<any>>;

  constructor(
    @InjectModel(Opportunity.name)
    private readonly opportunityModel: Model<OpportunityDocument>,
    @InjectModel(Lead.name)
    private readonly leadModel: Model<LeadDocument>,
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
    @InjectModel(Activity.name)
    private readonly activityModel: Model<ActivityDocument>,
    @InjectModel(Ticket.name)
    private readonly ticketModel: Model<TicketDocument>,
    @InjectModel(SavedReport.name)
    private readonly savedReportModel: Model<SavedReportDocument>,
    private readonly usersService: UsersService,
    private readonly teamsService: TeamsService,
  ) {
    this.models = {
      [Opportunity.name]: this.opportunityModel,
      [Lead.name]: this.leadModel,
      [Customer.name]: this.customerModel,
      [Activity.name]: this.activityModel,
      [Ticket.name]: this.ticketModel,
    };
  }

  // ── Metadata for the builder UI ────────────────────────────────────────────

  /** Field/operator registry so the builder UI can render pickers dynamically. */
  getDatasets() {
    return {
      datasets: REPORT_DATASETS,
      operators: REPORT_OPERATORS,
      operatorsByType: OPERATORS_BY_TYPE,
      metricFns: REPORT_METRIC_FNS,
      granularities: REPORT_GRANULARITIES,
    };
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────

  async getDashboard(
    keycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<DashboardResponseDto> {
    const vis = {
      organizationId,
      ...((await this.buildVisibilityFilter(keycloakId, organizationId)) ?? {}),
    };

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const revenueSince = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    const [
      stageAgg,
      wonThisMonth,
      funnelAgg,
      revenueAgg,
      sourceAgg,
      reps,
      customers,
      activeCustomers,
      openTickets,
      pendingTasks,
      overdueTasks,
    ] = await Promise.all([
      this.opportunityModel
        .aggregate<{
          _id: OpportunityStage;
          count: number;
          total: number;
          weighted: number;
        }>([
          { $match: vis },
          {
            $group: {
              _id: '$stage',
              count: { $sum: 1 },
              total: { $sum: '$amount' },
              weighted: {
                $sum: {
                  $divide: [{ $multiply: ['$amount', '$probability'] }, 100],
                },
              },
            },
          },
        ])
        .exec(),
      this.opportunityModel
        .aggregate<{ _id: null; count: number; total: number }>([
          {
            $match: {
              ...vis,
              stage: 'closed_won',
              closedAt: { $gte: startOfMonth },
            },
          },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              total: { $sum: '$amount' },
            },
          },
        ])
        .exec(),
      this.leadModel
        .aggregate<{
          _id: string;
          count: number;
        }>([
          { $match: vis },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ])
        .exec(),
      this.opportunityModel
        .aggregate<{ _id: string; wonValue: number; wonCount: number }>([
          {
            $match: {
              ...vis,
              stage: 'closed_won',
              closedAt: { $gte: revenueSince },
            },
          },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m', date: '$closedAt' } },
              wonValue: { $sum: '$amount' },
              wonCount: { $sum: 1 },
            },
          },
        ])
        .exec(),
      this.leadModel
        .aggregate<{
          _id: string;
          count: number;
        }>([
          { $match: vis },
          { $group: { _id: '$source', count: { $sum: 1 } } },
        ])
        .exec(),
      this.computeRepPerformance(vis),
      this.customerModel.countDocuments(vis).exec(),
      this.customerModel.countDocuments({ ...vis, status: 'active' }).exec(),
      this.ticketModel
        .countDocuments({ ...vis, status: { $in: ACTIVE_TICKET_STATUSES } })
        .exec(),
      this.activityModel
        .countDocuments({ ...vis, type: 'task', status: 'pending' })
        .exec(),
      this.activityModel
        .countDocuments({
          ...vis,
          type: 'task',
          status: 'pending',
          dueAt: { $lt: now },
        })
        .exec(),
    ]);

    // Pipeline buckets
    const stageMap = new Map(stageAgg.map((s) => [s._id, s]));
    const byStage = OPPORTUNITY_STAGES.map((stage) => {
      const b = stageMap.get(stage);
      return {
        stage,
        count: b?.count ?? 0,
        totalAmount: b?.total ?? 0,
        weightedAmount: Math.round(b?.weighted ?? 0),
      };
    });
    const openBuckets = byStage.filter((b) => !CLOSED_STAGES.includes(b.stage));
    const won = stageMap.get('closed_won');
    const lost = stageMap.get('closed_lost');
    const closedTotal = (won?.count ?? 0) + (lost?.count ?? 0);

    // Funnel
    const funnelMap = new Map(funnelAgg.map((f) => [f._id, f.count]));
    const totalLeads = funnelAgg.reduce((acc, f) => acc + f.count, 0);
    const converted = funnelMap.get('converted') ?? 0;

    // Revenue: fill all 12 month buckets
    const revenueMap = new Map(revenueAgg.map((r) => [r._id, r]));
    const revenueByMonth: RevenuePointDto[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const hit = revenueMap.get(key);
      revenueByMonth.push({
        month: key,
        wonValue: hit?.wonValue ?? 0,
        wonCount: hit?.wonCount ?? 0,
      });
    }

    // Lead source breakdown
    const leadsBySource: BreakdownSliceDto[] = sourceAgg
      .map((s) => ({
        key: s._id,
        label: LEAD_SOURCE_LABELS[s._id] ?? s._id,
        count: s.count,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      totals: {
        customers,
        activeCustomers,
        openTickets,
        pendingTasks,
        overdueTasks,
      },
      pipeline: {
        openCount: openBuckets.reduce((acc, b) => acc + b.count, 0),
        openValue: openBuckets.reduce((acc, b) => acc + b.totalAmount, 0),
        weightedValue: openBuckets.reduce(
          (acc, b) => acc + b.weightedAmount,
          0,
        ),
        wonThisMonthCount: wonThisMonth[0]?.count ?? 0,
        wonThisMonthValue: wonThisMonth[0]?.total ?? 0,
        winRate:
          closedTotal === 0
            ? 0
            : Math.round(((won?.count ?? 0) / closedTotal) * 100),
        byStage,
      },
      funnel: {
        totalLeads,
        new: funnelMap.get('new') ?? 0,
        contacted: funnelMap.get('contacted') ?? 0,
        qualified: funnelMap.get('qualified') ?? 0,
        unqualified: funnelMap.get('unqualified') ?? 0,
        converted,
        conversionRate:
          totalLeads === 0 ? 0 : Math.round((converted / totalLeads) * 100),
      },
      revenueByMonth,
      leadsBySource,
      topReps: reps.slice(0, 8),
    };
  }

  // ── Team performance ────────────────────────────────────────────────────────

  async getTeamPerformance(
    keycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<TeamPerformanceResponseDto> {
    const vis = {
      organizationId,
      ...((await this.buildVisibilityFilter(keycloakId, organizationId)) ?? {}),
    };

    const [reps, teamAgg] = await Promise.all([
      this.computeRepPerformance(vis),
      this.opportunityModel
        .aggregate<RepAggRow>([
          { $match: { ...vis, assignedTeamId: { $ne: null } } },
          {
            $group: {
              _id: '$assignedTeamId',
              wonCount: this.condSum({ $eq: ['$stage', 'closed_won'] }, 1),
              wonValue: this.condSum(
                { $eq: ['$stage', 'closed_won'] },
                '$amount',
              ),
              lostCount: this.condSum({ $eq: ['$stage', 'closed_lost'] }, 1),
              openCount: this.condSum(
                { $in: ['$stage', OPPORTUNITY_STAGES_OPEN] },
                1,
              ),
              openValue: this.condSum(
                { $in: ['$stage', OPPORTUNITY_STAGES_OPEN] },
                '$amount',
              ),
            },
          },
        ])
        .exec(),
    ]);

    const teamIds = teamAgg
      .map((t) => t._id)
      .filter((id): id is string => !!id);
    const teamNames = await this.teamsService.findNamesByIds(teamIds);
    const teamDocs = await Promise.all(
      teamIds.map((id) => this.teamsService.findDocById(id)),
    );
    const memberCounts = new Map(
      teamDocs
        .filter((t): t is NonNullable<typeof t> => !!t)
        .map((t) => [t._id.toString(), t.memberIds.length]),
    );

    const teams = teamAgg
      .map((t) => {
        const id = String(t._id);
        const closed = t.wonCount + t.lostCount;
        return {
          teamId: id,
          teamName: teamNames.get(id) ?? 'Unknown team',
          memberCount: memberCounts.get(id) ?? 0,
          wonCount: t.wonCount,
          wonValue: t.wonValue,
          openCount: t.openCount,
          openValue: t.openValue,
          winRate: closed === 0 ? 0 : Math.round((t.wonCount / closed) * 100),
        };
      })
      .sort((a, b) => b.wonValue - a.wonValue);

    return { reps, teams };
  }

  /** Per-owner opportunity rollup, sorted by won value desc. */
  private async computeRepPerformance(
    vis: Record<string, unknown>,
  ): Promise<RepPerformanceDto[]> {
    const rows = await this.opportunityModel
      .aggregate<RepAggRow>([
        { $match: { ...vis, assignedToId: { $ne: null } } },
        {
          $group: {
            _id: '$assignedToId',
            wonCount: this.condSum({ $eq: ['$stage', 'closed_won'] }, 1),
            wonValue: this.condSum(
              { $eq: ['$stage', 'closed_won'] },
              '$amount',
            ),
            lostCount: this.condSum({ $eq: ['$stage', 'closed_lost'] }, 1),
            openCount: this.condSum(
              { $in: ['$stage', OPPORTUNITY_STAGES_OPEN] },
              1,
            ),
            openValue: this.condSum(
              { $in: ['$stage', OPPORTUNITY_STAGES_OPEN] },
              '$amount',
            ),
          },
        },
      ])
      .exec();

    const ownerIds = rows.map((r) => r._id).filter((id): id is string => !!id);
    const staff = await this.usersService.findStaffByKeycloakIds(ownerIds);
    const nameById = new Map(
      staff.map((u) => [
        u.keycloakId,
        `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email,
      ]),
    );

    return rows
      .map((r) => {
        const id = String(r._id);
        const closed = r.wonCount + r.lostCount;
        return {
          ownerId: id,
          ownerName: nameById.get(id) ?? id,
          wonCount: r.wonCount,
          wonValue: r.wonValue,
          openCount: r.openCount,
          openValue: r.openValue,
          winRate: closed === 0 ? 0 : Math.round((r.wonCount / closed) * 100),
        };
      })
      .sort((a, b) => b.wonValue - a.wonValue);
  }

  /** `$sum` of `value` where `cond` holds (stage rollups). */
  private condSum(cond: Record<string, unknown>, value: unknown) {
    return { $sum: { $cond: [cond, value, 0] } };
  }

  // ── Custom Report Builder engine ────────────────────────────────────────────

  async runReport(
    dto: RunReportDto,
    keycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<ReportResultDto> {
    const dataset = getDataset(dto.dataset);
    if (!dataset) throw new BadRequestException('Unknown dataset');
    const model = this.models[dataset.model];

    const roleVis = await this.buildVisibilityFilter(
      keycloakId,
      organizationId,
    );
    const vis = { organizationId, ...(roleVis ?? {}) };
    const match = buildMatch(dataset, dto.filters, dto.dateRange, vis);

    if (dto.metrics && dto.metrics.length > 0) {
      return this.runAggregate(dataset, model, dto, match);
    }
    return this.runRows(dataset, model, dto, match);
  }

  private async runAggregate(
    dataset: ReportDataset,
    model: Model<any>,
    dto: RunReportDto,
    match: Record<string, unknown>,
  ): Promise<ReportResultDto> {
    const groupId = dto.groupBy
      ? buildGroupId(dataset, dto.groupBy, dto.groupByGranularity)
      : null;
    const { accumulators, aliases } = buildMetrics(dataset, dto.metrics ?? []);

    const rows = await model
      .aggregate<
        { _id: unknown } & Record<string, number>
      >([{ $match: match }, { $group: { _id: groupId, ...accumulators } }, { $sort: { [aliases[0]]: -1 } }, { $limit: 200 }])
      .exec();

    // Resolve friendly labels for id-based groupings
    let labelResolver: Map<string, string> | null = null;
    if (dto.groupBy === 'assignedToId') {
      const ids = rows
        .map((r) => r._id)
        .filter((v): v is string => typeof v === 'string');
      const staff = await this.usersService.findStaffByKeycloakIds(ids);
      labelResolver = new Map(
        staff.map((u) => [
          u.keycloakId,
          `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email,
        ]),
      );
    } else if (dto.groupBy === 'assignedTeamId') {
      const ids = rows.map((r) => String(r._id)).filter((v) => v !== 'null');
      labelResolver = await this.teamsService.findNamesByIds(ids);
    }

    const aggregate: ReportAggregateRow[] = rows.map((r) => {
      const rawId = r._id;
      let group: string | number | null;
      let label: string;

      if (rawId === null || rawId === undefined) {
        group = null;
        label = dto.groupBy ? 'Unassigned' : 'All';
      } else if (rawId instanceof Date) {
        group = rawId.toISOString();
        label = this.formatDateGroup(rawId, dto.groupByGranularity);
      } else if (typeof rawId === 'number') {
        group = rawId;
        label = String(rawId);
      } else if (typeof rawId === 'string' || typeof rawId === 'boolean') {
        group = String(rawId);
        label = labelResolver?.get(group) ?? group;
      } else {
        // Non-scalar group keys shouldn't occur, but never stringify an object
        group = null;
        label = 'Unknown';
      }

      const metrics: Record<string, number> = {};
      for (const alias of aliases) {
        const v = r[alias];
        metrics[alias] = typeof v === 'number' ? Math.round(v * 100) / 100 : 0;
      }
      return { group, groupLabel: label, metrics };
    });

    return {
      mode: 'aggregate',
      dataset: dataset.key,
      groupBy: dto.groupBy,
      groupByGranularity: dto.groupByGranularity,
      metricAliases: aliases,
      aggregate,
    };
  }

  private async runRows(
    dataset: ReportDataset,
    model: Model<any>,
    dto: RunReportDto,
    match: Record<string, unknown>,
  ): Promise<ReportResultDto> {
    const columns = this.resolveColumns(dataset, dto.columns);
    const sort = buildSort(dataset, dto.sortBy, dto.sortOrder);
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 25;
    const skip = (page - 1) * limit;

    const [docs, total] = await Promise.all([
      model
        .find(match)
        .select(columns.join(' '))
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean()
        .exec() as Promise<Record<string, unknown>[]>,
      model.countDocuments(match).exec(),
    ]);

    const rows = docs.map((doc) => this.normalizeRow(doc, columns));

    return {
      mode: 'rows',
      dataset: dataset.key,
      columns,
      rows,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  private resolveColumns(
    dataset: ReportDataset,
    requested?: string[],
  ): string[] {
    if (!requested || requested.length === 0) return dataset.defaultColumns;
    const known = new Set(dataset.fields.map((f) => f.key));
    const invalid = requested.filter((c) => !known.has(c));
    if (invalid.length > 0) {
      throw new BadRequestException(`Unknown column(s): ${invalid.join(', ')}`);
    }
    return requested;
  }

  private normalizeRow(
    doc: Record<string, unknown>,
    columns: string[],
  ): Record<string, unknown> {
    const row: Record<string, unknown> = {
      id: (doc._id as Types.ObjectId | undefined)?.toString() ?? null,
    };
    for (const col of columns) {
      const v = doc[col];
      if (v instanceof Date) row[col] = v.toISOString();
      else if (v instanceof Types.ObjectId) row[col] = v.toString();
      else row[col] = v ?? null;
    }
    return row;
  }

  private formatDateGroup(date: Date, granularity?: string): string {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    switch (granularity) {
      case 'year':
        return `${y}`;
      case 'quarter':
        return `${y} Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
      case 'month':
        return `${y}-${m}`;
      default:
        return `${y}-${m}-${d}`;
    }
  }

  // ── Saved reports ────────────────────────────────────────────────────────────

  async createSaved(
    dto: CreateSavedReportDto,
    keycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<SavedReportResponseDto> {
    this.validateDefinition(dto);

    const report = await this.savedReportModel.create({
      organizationId,
      name: dto.name.trim(),
      description: dto.description?.trim(),
      dataset: dto.dataset,
      filters: dto.filters ?? [],
      dateRange: dto.dateRange,
      groupBy: dto.groupBy,
      groupByGranularity: dto.groupByGranularity,
      metrics: dto.metrics ?? [],
      columns: dto.columns ?? [],
      sortBy: dto.sortBy,
      sortOrder: dto.sortOrder,
      shared: dto.shared ?? false,
      createdBy: keycloakId,
    });

    this.logger.log(`Saved report created: "${report.name}"`);
    return this.mapSaved(report, keycloakId);
  }

  async findSaved(
    keycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<SavedReportResponseDto[]> {
    const admin = await this.isAdmin(keycloakId);
    const filter = admin
      ? { organizationId }
      : {
          organizationId,
          $or: [{ shared: true }, { createdBy: keycloakId }],
        };

    const reports = await this.savedReportModel
      .find(filter)
      .sort({ updatedAt: -1 })
      .exec();

    return this.mapSavedMany(reports, keycloakId, admin);
  }

  async findSavedOne(
    id: string,
    keycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<SavedReportResponseDto> {
    const report = await this.getSavedOrFail(id, organizationId);
    await this.assertCanViewSaved(report, keycloakId);
    return this.mapSaved(report, keycloakId);
  }

  async updateSaved(
    id: string,
    dto: CreateSavedReportDto,
    keycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<SavedReportResponseDto> {
    const report = await this.getSavedOrFail(id, organizationId);
    await this.assertCanManageSaved(report, keycloakId);
    this.validateDefinition(dto);

    report.name = dto.name.trim();
    report.description = dto.description?.trim();
    report.dataset = dto.dataset;
    report.filters = dto.filters ?? [];
    report.dateRange = dto.dateRange;
    report.groupBy = dto.groupBy;
    report.groupByGranularity = dto.groupByGranularity;
    report.metrics = dto.metrics ?? [];
    report.columns = dto.columns ?? [];
    report.sortBy = dto.sortBy;
    report.sortOrder = dto.sortOrder;
    if (dto.shared !== undefined) report.shared = dto.shared;

    await report.save();
    this.logger.log(`Saved report updated: ${id}`);
    return this.mapSaved(report, keycloakId);
  }

  async removeSaved(
    id: string,
    keycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<void> {
    const report = await this.getSavedOrFail(id, organizationId);
    await this.assertCanManageSaved(report, keycloakId);
    await this.savedReportModel.deleteOne({ _id: report._id }).exec();
    this.logger.log(`Saved report deleted: ${id}`);
  }

  /** Run a saved report; `overrides` lets the UI page/sort the result. */
  async runSaved(
    id: string,
    keycloakId: string,
    organizationId: Types.ObjectId,
    overrides?: Pick<RunReportDto, 'page' | 'limit' | 'sortBy' | 'sortOrder'>,
  ): Promise<ReportResultDto> {
    const report = await this.getSavedOrFail(id, organizationId);
    await this.assertCanViewSaved(report, keycloakId);

    const dto: RunReportDto = {
      dataset: report.dataset,
      filters: report.filters,
      dateRange: report.dateRange,
      groupBy: report.groupBy,
      groupByGranularity: report.groupByGranularity,
      metrics: report.metrics,
      columns: report.columns,
      sortBy: overrides?.sortBy ?? report.sortBy,
      sortOrder: overrides?.sortOrder ?? report.sortOrder,
      page: overrides?.page ?? 1,
      limit: overrides?.limit ?? 25,
    };
    return this.runReport(dto, keycloakId, organizationId);
  }

  /** Dry-run the definition through the compilers to fail fast on save. */
  private validateDefinition(dto: RunReportDto): void {
    const dataset = getDataset(dto.dataset);
    if (!dataset) throw new BadRequestException('Unknown dataset');
    buildMatch(dataset, dto.filters, dto.dateRange, null);
    if (dto.metrics && dto.metrics.length > 0) {
      if (dto.groupBy)
        buildGroupId(dataset, dto.groupBy, dto.groupByGranularity);
      buildMetrics(dataset, dto.metrics);
    } else {
      this.resolveColumns(dataset, dto.columns);
      buildSort(dataset, dto.sortBy, dto.sortOrder);
    }
  }

  // ── Visibility (same model as the domain services) ──────────────────────────

  private async buildVisibilityFilter(
    keycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<Record<string, unknown> | null> {
    const appUser = await this.usersService.findByKeycloakId(keycloakId);
    if (!appUser) {
      throw new ForbiddenException('No app user record for this account');
    }
    if (
      appUser.role === AppRole.Admin ||
      appUser.role === AppRole.Administrator
    ) {
      return null;
    }
    const teamIds = await this.teamsService.getTeamIdsForMember(
      keycloakId,
      organizationId,
    );
    return {
      $or: [
        { assignedToId: keycloakId },
        { assignedTeamId: { $in: teamIds } },
        { createdBy: keycloakId },
      ],
    };
  }

  private async isAdmin(keycloakId: string): Promise<boolean> {
    const appUser = await this.usersService.findByKeycloakId(keycloakId);
    return (
      appUser?.role === AppRole.Admin || appUser?.role === AppRole.Administrator
    );
  }

  private async getSavedOrFail(
    id: string,
    organizationId: Types.ObjectId,
  ): Promise<SavedReportDocument> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Report with ID ${id} not found`);
    }
    const report = await this.savedReportModel
      .findOne({ _id: id, organizationId })
      .exec();
    if (!report) {
      throw new NotFoundException(`Report with ID ${id} not found`);
    }
    return report;
  }

  private async assertCanViewSaved(
    report: SavedReportDocument,
    keycloakId: string,
  ): Promise<void> {
    if (report.shared || report.createdBy === keycloakId) return;
    if (await this.isAdmin(keycloakId)) return;
    throw new NotFoundException(
      `Report with ID ${report._id.toString()} not found`,
    );
  }

  private async assertCanManageSaved(
    report: SavedReportDocument,
    keycloakId: string,
  ): Promise<void> {
    if (report.createdBy === keycloakId) return;
    if (await this.isAdmin(keycloakId)) return;
    throw new ForbiddenException(
      'Only the report owner or an admin can modify this report',
    );
  }

  private async mapSaved(
    report: SavedReportDocument,
    keycloakId: string,
  ): Promise<SavedReportResponseDto> {
    const [dto] = await this.mapSavedMany(
      [report],
      keycloakId,
      await this.isAdmin(keycloakId),
    );
    return dto;
  }

  private async mapSavedMany(
    reports: SavedReportDocument[],
    keycloakId: string,
    admin: boolean,
  ): Promise<SavedReportResponseDto[]> {
    if (reports.length === 0) return [];
    const creatorIds = [...new Set(reports.map((r) => r.createdBy))];
    const staff = await this.usersService.findStaffByKeycloakIds(creatorIds);
    const nameById = new Map(
      staff.map((u) => [
        u.keycloakId,
        `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email,
      ]),
    );
    return reports.map((r) =>
      toSavedReportResponseDto(r, {
        createdByName: nameById.get(r.createdBy) ?? null,
        canManage: admin || r.createdBy === keycloakId,
      }),
    );
  }
}
