import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { Account, AccountDocument } from '../accounts/account.schema';
import { CalendarSyncService } from '../calendar-sync/calendar-sync.service';
import { Contact, ContactDocument } from '../contacts/contact.schema';
import { Customer, CustomerDocument } from '../customers/customer.schema';
import { CrmEventBus } from '../events/crm-event-bus.service';
import {
  ENGAGEMENT_DEFAULT_POINTS,
  EngagementType,
  Lead,
  LeadDocument,
} from '../leads/lead.schema';
import { computeScore } from '../leads/mappers/lead.mapper';
import {
  Opportunity,
  OpportunityDocument,
} from '../opportunities/opportunity.schema';
import { Ticket, TicketDocument } from '../tickets/ticket.schema';
import { TeamDocument } from '../teams/team.schema';
import { TeamsService } from '../teams/teams.service';
import { AppRole } from '../users/app-role.enum';
import { UsersService } from '../users/users.service';
import {
  Activity,
  ActivityDocument,
  ActivityType,
  COMMUNICATION_TYPES,
  RelatedType,
} from './activity.schema';
import { ActivityQueryDto } from './dto/activity-query.dto';
import { ActivityResponseDto } from './dto/activity-response.dto';
import { ActivityStatsDto } from './dto/activity-stats.dto';
import { AssignActivityDto } from './dto/assign-activity.dto';
import { CreateActivityDto } from './dto/create-activity.dto';
import { SetActivityStatusDto } from './dto/set-activity-status.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { activityToIcs } from './ics.util';
import {
  ActivityLookupNames,
  relatedKey,
  toActivityResponseDto,
} from './mappers/activity.mapper';

/** Escape user input so it can be safely embedded in a RegExp. */
function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * How a completed communication activity maps onto a lead engagement.
 * Inbound email = the lead replied to us; outbound email and SMS carry no
 * engagement signal beyond the note itself.
 */
function leadEngagementTypeFor(
  type: ActivityType,
  direction?: string,
): EngagementType {
  if (type === 'call') return 'call';
  if (type === 'meeting') return 'meeting';
  if (type === 'email' && direction === 'inbound') return 'email_replied';
  return 'note';
}

/** Engagement types that imply a rep actually reached the lead. */
const CONTACT_ENGAGEMENTS: readonly EngagementType[] = [
  'call',
  'meeting',
  'email_replied',
];

@Injectable()
export class ActivitiesService {
  private readonly logger = new Logger(ActivitiesService.name);

  constructor(
    @InjectModel(Activity.name)
    private readonly activityModel: Model<ActivityDocument>,
    // Read-mostly access to linkable records: existence checks, owner
    // lookup for automated assignment, name denormalization, and the
    // completed-communication feed-through into lead/contact histories.
    // Registering the schemas directly (AccountsModule precedent) keeps
    // ActivitiesModule free of feature-module dependencies and cycles.
    @InjectModel(Lead.name)
    private readonly leadModel: Model<LeadDocument>,
    @InjectModel(Contact.name)
    private readonly contactModel: Model<ContactDocument>,
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
    @InjectModel(Account.name)
    private readonly accountModel: Model<AccountDocument>,
    @InjectModel(Opportunity.name)
    private readonly opportunityModel: Model<OpportunityDocument>,
    @InjectModel(Ticket.name)
    private readonly ticketModel: Model<TicketDocument>,
    private readonly usersService: UsersService,
    private readonly teamsService: TeamsService,
    private readonly eventBus: CrmEventBus,
    private readonly calendarSyncService: CalendarSyncService,
  ) {}

  /** Best-effort push to the assignee's connected calendar — never fails the write. */
  private async syncToCalendar(activity: ActivityDocument): Promise<void> {
    try {
      await this.calendarSyncService.onActivityChanged(activity);
    } catch (error) {
      this.logger.error(
        `Calendar sync push failed for activity ${activity._id.toString()}:`,
        error,
      );
    }
  }

  private async unsyncFromCalendar(activity: ActivityDocument): Promise<void> {
    try {
      await this.calendarSyncService.onActivityDeleted(activity);
    } catch (error) {
      this.logger.error(
        `Calendar sync delete failed for activity ${activity._id.toString()}:`,
        error,
      );
    }
  }

  // ── Create ──────────────────────────────────────────────────────────────

  async create(
    dto: CreateActivityDto,
    createdBy: string,
    organizationId: Types.ObjectId,
  ): Promise<ActivityResponseDto> {
    if ((dto.relatedType == null) !== (dto.relatedId == null)) {
      throw new BadRequestException(
        'relatedType and relatedId must be provided together',
      );
    }

    this.assertDateRange(
      dto.startAt ? new Date(dto.startAt) : undefined,
      dto.endAt ? new Date(dto.endAt) : undefined,
    );

    // Load the linked record (also validates it exists)
    const related = dto.relatedType
      ? await this.getRelatedOrFail(dto.relatedType, dto.relatedId!)
      : null;

    // Automated assignment: explicit assignee → linked record's owner →
    // creator. Team routing inherits from the linked record when omitted.
    let assignedToId = dto.assignedToId;
    if (assignedToId) {
      await this.getStaffUserOrFail(assignedToId);
    } else {
      const relatedOwner = (related as { assignedToId?: string } | null)
        ?.assignedToId;
      assignedToId = relatedOwner ?? createdBy;
      if (relatedOwner) {
        const [owner] = await this.usersService.findStaffByKeycloakIds([
          relatedOwner,
        ]);
        if (!owner) assignedToId = createdBy;
      }
    }

    let assignedTeamId: Types.ObjectId | undefined;
    if (dto.assignedTeamId) {
      assignedTeamId = (await this.getActiveTeamOrFail(dto.assignedTeamId))._id;
    } else {
      const relatedTeam = (
        related as { assignedTeamId?: Types.ObjectId } | null
      )?.assignedTeamId;
      if (relatedTeam) assignedTeamId = relatedTeam;
    }

    // Communications logged after the fact default to completed; tasks and
    // scheduled items stay open.
    const isCommunication = COMMUNICATION_TYPES.includes(dto.type);
    const status =
      dto.status ?? (isCommunication && !dto.startAt ? 'completed' : 'pending');

    const activity = await this.activityModel.create({
      organizationId,
      type: dto.type,
      subject: dto.subject.trim(),
      description: dto.description?.trim(),
      status,
      priority: dto.priority ?? 'normal',
      direction: isCommunication ? dto.direction : undefined,
      dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
      startAt: dto.startAt ? new Date(dto.startAt) : undefined,
      endAt: dto.endAt ? new Date(dto.endAt) : undefined,
      remindAt: dto.remindAt ? new Date(dto.remindAt) : undefined,
      completedAt: status === 'completed' ? new Date() : undefined,
      relatedType: dto.relatedType,
      relatedId: dto.relatedId ? new Types.ObjectId(dto.relatedId) : undefined,
      createdBy,
      assignedToId,
      ...(assignedTeamId ? { assignedTeamId } : {}),
    });

    if (activity.status === 'completed') {
      await this.syncCompletedCommunication(activity);
    }
    await this.syncToCalendar(activity);

    this.logger.log(
      `Activity created: ${activity.type} "${activity.subject}" (assigned to ${assignedToId})`,
    );
    return this.mapOne(activity);
  }

  // ── Read ────────────────────────────────────────────────────────────────

  async findAll(
    query: ActivityQueryDto,
    requesterKeycloakId: string,
    organizationId: Types.ObjectId,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    if ((query.relatedType == null) !== (query.relatedId == null)) {
      throw new BadRequestException(
        'relatedType and relatedId must be provided together',
      );
    }

    const conditions: Record<string, unknown>[] = [{ organizationId }];

    if (query.search?.trim()) {
      const searchRegex = new RegExp(escapeRegExp(query.search.trim()), 'i');
      conditions.push({
        $or: [{ subject: searchRegex }, { description: searchRegex }],
      });
    }
    if (query.type) conditions.push({ type: query.type });
    if (query.status) conditions.push({ status: query.status });
    if (query.priority) conditions.push({ priority: query.priority });
    if (query.assignedToId)
      conditions.push({ assignedToId: query.assignedToId });
    if (query.relatedType && query.relatedId) {
      conditions.push({
        relatedType: query.relatedType,
        relatedId: new Types.ObjectId(query.relatedId),
      });
    }
    if (query.due) conditions.push(this.dueWindowFilter(query.due));

    const visibility = await this.buildVisibilityFilter(
      requesterKeycloakId,
      organizationId,
    );
    if (visibility) conditions.push(visibility);

    const filter: Record<string, unknown> =
      conditions.length === 0
        ? {}
        : conditions.length === 1
          ? conditions[0]
          : { $and: conditions };

    const sortBy = query.sortBy ?? 'createdAt';
    const direction = query.sortOrder === 'asc' ? 1 : -1;
    // Secondary _id sort keeps pagination stable when the primary key has ties
    const sort: Record<string, 1 | -1> = {
      [sortBy]: direction,
      _id: direction,
    };

    const [items, total] = await Promise.all([
      this.activityModel.find(filter).sort(sort).skip(skip).limit(limit).exec(),
      this.activityModel.countDocuments(filter).exec(),
    ]);

    return {
      data: await this.mapMany(items),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getStats(
    requesterKeycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<ActivityStatsDto> {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const startOfMonth = new Date(now);
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const inSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const visibility = {
      organizationId,
      ...((await this.buildVisibilityFilter(
        requesterKeycloakId,
        organizationId,
      )) ?? {}),
    };

    const [
      openTasks,
      overdue,
      dueToday,
      remindersDue,
      upcomingMeetings,
      completedThisMonth,
    ] = await Promise.all([
      this.activityModel
        .countDocuments({ ...visibility, type: 'task', status: 'pending' })
        .exec(),
      this.activityModel
        .countDocuments({
          ...visibility,
          status: 'pending',
          dueAt: { $lt: now },
        })
        .exec(),
      this.activityModel
        .countDocuments({
          ...visibility,
          status: 'pending',
          dueAt: { $gte: startOfToday, $lte: endOfToday },
        })
        .exec(),
      this.activityModel
        .countDocuments({
          ...visibility,
          status: 'pending',
          remindAt: { $lte: now },
        })
        .exec(),
      this.activityModel
        .countDocuments({
          ...visibility,
          type: 'meeting',
          status: 'pending',
          startAt: { $gte: now, $lte: inSevenDays },
        })
        .exec(),
      this.activityModel
        .countDocuments({
          ...visibility,
          status: 'completed',
          completedAt: { $gte: startOfMonth },
        })
        .exec(),
    ]);

    return {
      openTasks,
      overdue,
      dueToday,
      remindersDue,
      upcomingMeetings,
      completedThisMonth,
    };
  }

  async findOne(
    id: string,
    requesterKeycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<ActivityResponseDto> {
    const activity = await this.getByIdOrFail(id, organizationId);
    await this.assertCanView(activity, requesterKeycloakId, organizationId);
    return this.mapOne(activity);
  }

  /** iCalendar (.ics) rendering for calendar import (Outlook/Google/Exchange). */
  async getIcs(
    id: string,
    requesterKeycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<string> {
    const activity = await this.getByIdOrFail(id, organizationId);
    await this.assertCanView(activity, requesterKeycloakId, organizationId);
    if (!activity.startAt && !activity.dueAt) {
      throw new BadRequestException(
        'This activity has no date to export — set a due date or schedule it first',
      );
    }
    return activityToIcs(activity);
  }

  // ── Update / status / assign / delete ───────────────────────────────────

  async update(
    id: string,
    dto: UpdateActivityDto,
    requesterKeycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<ActivityResponseDto> {
    const activity = await this.getByIdOrFail(id, organizationId);
    await this.assertCanView(activity, requesterKeycloakId, organizationId);

    if (dto.subject !== undefined) activity.subject = dto.subject.trim();
    if (dto.description !== undefined)
      activity.description = dto.description.trim();
    if (dto.priority !== undefined) activity.priority = dto.priority;
    if (dto.direction !== undefined) activity.direction = dto.direction;

    // Date fields: omitted = unchanged, null = cleared, value = set
    if (dto.dueAt !== undefined)
      activity.dueAt = dto.dueAt ? new Date(dto.dueAt) : undefined;
    if (dto.startAt !== undefined)
      activity.startAt = dto.startAt ? new Date(dto.startAt) : undefined;
    if (dto.endAt !== undefined)
      activity.endAt = dto.endAt ? new Date(dto.endAt) : undefined;
    if (dto.remindAt !== undefined)
      activity.remindAt = dto.remindAt ? new Date(dto.remindAt) : undefined;

    this.assertDateRange(activity.startAt, activity.endAt);

    await activity.save();
    await this.syncToCalendar(activity);
    this.logger.log(`Activity updated: ${id}`);
    return this.mapOne(activity);
  }

  /** Complete, reopen, or cancel. Completion stamps completedAt and feeds
   *  the communication into the linked record's history (once). */
  async setStatus(
    id: string,
    dto: SetActivityStatusDto,
    requesterKeycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<ActivityResponseDto> {
    const activity = await this.getByIdOrFail(id, organizationId);
    await this.assertCanView(activity, requesterKeycloakId, organizationId);

    if (activity.status === dto.status) {
      return this.mapOne(activity);
    }

    activity.status = dto.status;
    activity.completedAt = dto.status === 'completed' ? new Date() : undefined;
    await activity.save();

    if (dto.status === 'completed') {
      await this.syncCompletedCommunication(activity);
    }
    if (dto.status === 'cancelled') {
      await this.unsyncFromCalendar(activity);
    } else {
      await this.syncToCalendar(activity);
    }

    this.logger.log(`Activity ${id} status → ${dto.status}`);
    return this.mapOne(activity);
  }

  /** Reassign responsibility and/or team routing. */
  async assign(
    id: string,
    dto: AssignActivityDto,
    organizationId: Types.ObjectId,
  ): Promise<ActivityResponseDto> {
    const activity = await this.getByIdOrFail(id, organizationId);

    if (dto.assignedToId !== undefined) {
      await this.getStaffUserOrFail(dto.assignedToId);
      activity.assignedToId = dto.assignedToId;
    }

    if (dto.assignedTeamId !== undefined) {
      if (dto.assignedTeamId === null) {
        activity.assignedTeamId = undefined;
      } else {
        activity.assignedTeamId = (
          await this.getActiveTeamOrFail(dto.assignedTeamId)
        )._id;
      }
    }

    // Consistency rule: when the record ends up with both an owner and a
    // team, the owner must be a member of that team.
    if (activity.assignedTeamId) {
      const team = await this.teamsService.findDocById(
        activity.assignedTeamId.toString(),
      );
      if (team && !team.memberIds.includes(activity.assignedToId)) {
        throw new BadRequestException(
          'Assignee must be a member of the assigned team',
        );
      }
    }

    await activity.save();
    this.logger.log(
      `Activity ${id} routed: assignee=${activity.assignedToId}, team=${activity.assignedTeamId?.toString() ?? 'none'}`,
    );
    return this.mapOne(activity);
  }

  async remove(id: string, organizationId: Types.ObjectId): Promise<void> {
    const activity = await this.getByIdOrFail(id, organizationId);
    await this.unsyncFromCalendar(activity);
    await this.activityModel.deleteOne({ _id: activity._id }).exec();
    this.logger.log(`Activity deleted: ${id}`);
  }

  // ── Feed-through: completed communications enrich the linked record ────

  /**
   * A completed call/email/meeting/sms/note linked to a Lead adds an
   * engagement (updating the score, and bumping new → contacted on real
   * two-way contact); linked to a Contact it appends to the communication
   * history. Runs once per activity (syncedToRecord guard); best-effort —
   * a failure here never fails the activity write.
   */
  private async syncCompletedCommunication(
    activity: ActivityDocument,
  ): Promise<void> {
    if (
      activity.syncedToRecord ||
      !COMMUNICATION_TYPES.includes(activity.type) ||
      !activity.relatedType ||
      !activity.relatedId
    ) {
      return;
    }

    try {
      if (activity.relatedType === 'lead') {
        const lead = await this.leadModel.findById(activity.relatedId).exec();
        // Converted leads are read-only — leave their history untouched
        if (!lead || lead.status === 'converted') return;

        const previousScore = lead.score;
        const previousStatus = lead.status;
        const engagementType = leadEngagementTypeFor(
          activity.type,
          activity.direction,
        );
        lead.engagements.push({
          type: engagementType,
          points: ENGAGEMENT_DEFAULT_POINTS[engagementType],
          note: activity.subject,
          recordedBy: activity.assignedToId,
          occurredAt: activity.completedAt ?? new Date(),
        });
        lead.score = computeScore(lead);
        if (
          lead.status === 'new' &&
          CONTACT_ENGAGEMENTS.includes(engagementType)
        ) {
          lead.status = 'contacted';
        }
        await lead.save();

        // The feed-through changed the lead — publish the same domain
        // events LeadsService would, so automation rules see them too.
        if (lead.score !== previousScore) {
          this.eventBus.emit({
            event: 'lead.score_changed',
            recordType: 'lead',
            recordId: lead._id.toString(),
            record: lead.toObject() as unknown as Record<string, unknown>,
            context: { previousScore, newScore: lead.score },
          });
        }
        if (lead.status !== previousStatus) {
          this.eventBus.emit({
            event: 'lead.status_changed',
            recordType: 'lead',
            recordId: lead._id.toString(),
            record: lead.toObject() as unknown as Record<string, unknown>,
            context: { previousStatus, newStatus: lead.status },
          });
        }
      } else if (activity.relatedType === 'contact') {
        const contact = await this.contactModel
          .findById(activity.relatedId)
          .exec();
        if (!contact) return;

        contact.interactions.push({
          type: activity.type === 'task' ? 'note' : activity.type,
          direction: activity.direction,
          subject: activity.subject,
          note: activity.description || undefined,
          recordedBy: activity.assignedToId,
          occurredAt: activity.completedAt ?? new Date(),
        });
        await contact.save();
      } else {
        return; // other record types keep their own histories
      }

      activity.syncedToRecord = true;
      await activity.save();
      this.logger.log(
        `Activity ${activity._id.toString()} synced into ${activity.relatedType} ${activity.relatedId.toString()}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to sync activity ${activity._id.toString()} into its linked record:`,
        error,
      );
    }
  }

  // ── Row-level visibility (same model as CustomersService) ──────────────

  /**
   * Build the Mongo filter limiting what the caller may see.
   * Returns null for Admin/Administrator (unrestricted). Regular staff
   * (AppRole.User) see records they own, records routed to one of their
   * active teams, or records they created.
   */
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

  /** 404 (not 403) outside the caller's scope, to avoid leaking existence. */
  private async assertCanView(
    activity: ActivityDocument,
    keycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<void> {
    const appUser = await this.usersService.findByKeycloakId(keycloakId);
    if (!appUser) {
      throw new ForbiddenException('No app user record for this account');
    }
    if (
      appUser.role === AppRole.Admin ||
      appUser.role === AppRole.Administrator
    ) {
      return;
    }
    if (
      activity.assignedToId === keycloakId ||
      activity.createdBy === keycloakId
    ) {
      return;
    }
    if (activity.assignedTeamId) {
      const teamIds = await this.teamsService.getTeamIdsForMember(
        keycloakId,
        organizationId,
      );
      if (teamIds.some((teamId) => teamId.equals(activity.assignedTeamId))) {
        return;
      }
    }
    throw new NotFoundException(
      `Activity with ID ${activity._id.toString()} not found`,
    );
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private dueWindowFilter(
    due: 'overdue' | 'today' | 'week',
  ): Record<string, unknown> {
    const now = new Date();
    if (due === 'overdue') {
      return { status: 'pending', dueAt: { $lt: now } };
    }
    if (due === 'today') {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      return { status: 'pending', dueAt: { $gte: start, $lte: end } };
    }
    const inSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return { status: 'pending', dueAt: { $gte: now, $lte: inSevenDays } };
  }

  private assertDateRange(startAt?: Date, endAt?: Date): void {
    if (endAt && !startAt) {
      throw new BadRequestException('endAt requires startAt');
    }
    if (startAt && endAt && endAt.getTime() <= startAt.getTime()) {
      throw new BadRequestException('endAt must be after startAt');
    }
  }

  private relatedModel(type: RelatedType): Model<never> {
    switch (type) {
      case 'lead':
        return this.leadModel as Model<never>;
      case 'contact':
        return this.contactModel as Model<never>;
      case 'customer':
        return this.customerModel as Model<never>;
      case 'account':
        return this.accountModel as Model<never>;
      case 'opportunity':
        return this.opportunityModel as Model<never>;
      case 'ticket':
        return this.ticketModel as Model<never>;
    }
  }

  private async getRelatedOrFail(
    type: RelatedType,
    id: string,
  ): Promise<unknown> {
    const doc = await this.relatedModel(type).findById(id).exec();
    if (!doc) {
      throw new BadRequestException(`Linked ${type} not found`);
    }
    return doc;
  }

  private async getActiveTeamOrFail(teamId: string): Promise<TeamDocument> {
    const team = await this.teamsService.findDocById(teamId);
    if (!team) {
      throw new BadRequestException('Assigned team not found');
    }
    if (!team.isActive) {
      throw new BadRequestException(
        'Records cannot be routed to an inactive team',
      );
    }
    return team;
  }

  private async getStaffUserOrFail(keycloakId: string): Promise<void> {
    const [owner] = await this.usersService.findStaffByKeycloakIds([
      keycloakId,
    ]);
    if (!owner) {
      throw new BadRequestException('Assignee must be an existing staff user');
    }
  }

  // ── Mapping ─────────────────────────────────────────────────────────────

  private async mapOne(
    activity: ActivityDocument,
  ): Promise<ActivityResponseDto> {
    const [dto] = await this.mapMany([activity]);
    return dto;
  }

  /** Batch-denormalize staff/team/related-record names (one lookup per collection per page). */
  private async mapMany(
    activities: ActivityDocument[],
  ): Promise<ActivityResponseDto[]> {
    if (activities.length === 0) return [];

    const staffIds = [
      ...new Set(activities.flatMap((a) => [a.createdBy, a.assignedToId])),
    ];
    const teamIds = [
      ...new Set(
        activities
          .map((a) => a.assignedTeamId?.toString())
          .filter((v): v is string => !!v),
      ),
    ];

    const [staff, teamNames, relatedNames] = await Promise.all([
      this.usersService.findStaffByKeycloakIds(staffIds),
      this.teamsService.findNamesByIds(teamIds),
      this.buildRelatedNames(activities),
    ]);

    const staffNames = new Map(
      staff.map((u) => [
        u.keycloakId,
        `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email,
      ]),
    );

    const names: ActivityLookupNames = { staffNames, teamNames, relatedNames };
    return activities.map((a) => toActivityResponseDto(a, names));
  }

  /** One $in query per linked collection to resolve display names. */
  private async buildRelatedNames(
    activities: ActivityDocument[],
  ): Promise<Map<string, string>> {
    const idsByType = new Map<RelatedType, Types.ObjectId[]>();
    for (const a of activities) {
      if (!a.relatedType || !a.relatedId) continue;
      const list = idsByType.get(a.relatedType) ?? [];
      list.push(a.relatedId);
      idsByType.set(a.relatedType, list);
    }

    const result = new Map<string, string>();
    await Promise.all(
      [...idsByType.entries()].map(async ([type, ids]) => {
        if (type === 'lead') {
          const docs = await this.leadModel
            .find({ _id: { $in: ids } })
            .select('firstName lastName')
            .exec();
          docs.forEach((d) =>
            result.set(
              relatedKey(type, d._id.toString()),
              `${d.firstName} ${d.lastName}`,
            ),
          );
        } else if (type === 'contact') {
          const docs = await this.contactModel
            .find({ _id: { $in: ids } })
            .select('firstName lastName')
            .exec();
          docs.forEach((d) =>
            result.set(
              relatedKey(type, d._id.toString()),
              `${d.firstName} ${d.lastName}`,
            ),
          );
        } else if (type === 'customer') {
          const docs = await this.customerModel
            .find({ _id: { $in: ids } })
            .select('firstName lastName')
            .exec();
          docs.forEach((d) =>
            result.set(
              relatedKey(type, d._id.toString()),
              `${d.firstName} ${d.lastName}`,
            ),
          );
        } else if (type === 'account') {
          const docs = await this.accountModel
            .find({ _id: { $in: ids } })
            .select('name')
            .exec();
          docs.forEach((d) =>
            result.set(relatedKey(type, d._id.toString()), d.name),
          );
        } else if (type === 'opportunity') {
          const docs = await this.opportunityModel
            .find({ _id: { $in: ids } })
            .select('name')
            .exec();
          docs.forEach((d) =>
            result.set(relatedKey(type, d._id.toString()), d.name),
          );
        } else {
          const docs = await this.ticketModel
            .find({ _id: { $in: ids } })
            .select('number subject')
            .exec();
          docs.forEach((d) =>
            result.set(
              relatedKey(type, d._id.toString()),
              `${d.number} — ${d.subject}`,
            ),
          );
        }
      }),
    );

    return result;
  }

  /** Load an activity by id, rejecting malformed ids with a 404 instead of a Mongoose CastError (500). */
  private async getByIdOrFail(
    id: string,
    organizationId: Types.ObjectId,
  ): Promise<ActivityDocument> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Activity with ID ${id} not found`);
    }
    const activity = await this.activityModel
      .findOne({ _id: id, organizationId })
      .exec();
    if (!activity) {
      throw new NotFoundException(`Activity with ID ${id} not found`);
    }
    return activity;
  }
}
