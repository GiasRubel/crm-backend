import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { isValidObjectId, Model, Types } from 'mongoose';
import { AccountsService } from '../accounts/accounts.service';
import {
  AuditActor,
  AuditService,
  diffFields,
  omitFields,
} from '../audit/audit.service';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { parseCsvToRecords, toCsv } from '../import-export/csv.util';
import {
  ImportResultDto,
  MAX_IMPORT_ROWS,
  runImport,
} from '../import-export/import-result.dto';
import { CustomersService } from '../customers/customers.service';
import { CrmEventBus } from '../events/crm-event-bus.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { FieldRestrictionInfo } from '../roles/permissions.service';
import { PermissionsService } from '../roles/permissions.service';
import { TeamDocument } from '../teams/team.schema';
import { TeamsService } from '../teams/teams.service';
import { UsersService } from '../users/users.service';
import { Contact, ContactDocument } from './contact.schema';
import { AddInteractionDto } from './dto/add-interaction.dto';
import { AssignContactDto } from './dto/assign-contact.dto';
import { ContactQueryDto } from './dto/contact-query.dto';
import { ContactResponseDto } from './dto/contact-response.dto';
import { ContactStatsDto } from './dto/contact-stats.dto';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { toContactResponseDto } from './mappers/contact.mapper';

/** Escape user input so it can be safely embedded in a RegExp. */
function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Cap CSV exports at a sane row count to keep the response fast and memory-bounded. */
const EXPORT_ROW_LIMIT = 5000;

/** Top-level fields tracked for the update-diff audit entry. */
const CONTACT_AUDIT_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'jobTitle',
  'department',
  'accountId',
  'customerId',
  'isPrimary',
  'preferredChannel',
  'emailOptIn',
  'phoneOptIn',
  'smsOptIn',
  'doNotContact',
  'customFields',
];

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name);

  constructor(
    @InjectModel(Contact.name)
    private readonly contactModel: Model<ContactDocument>,
    private readonly usersService: UsersService,
    private readonly teamsService: TeamsService,
    private readonly accountsService: AccountsService,
    private readonly customersService: CustomersService,
    private readonly eventBus: CrmEventBus,
    private readonly auditService: AuditService,
    private readonly customFieldsService: CustomFieldsService,
    private readonly notificationsService: NotificationsService,
    private readonly permissionsService: PermissionsService,
  ) {}

  // ── Create ──────────────────────────────────────────────────────────────

  async create(
    dto: CreateContactDto,
    createdBy: string,
    organizationId: Types.ObjectId,
  ): Promise<ContactResponseDto> {
    await this.permissionsService.requirePermission(
      createdBy,
      organizationId,
      'contact',
      'create',
    );
    const email = dto.email.trim().toLowerCase();
    await this.assertEmailAvailable(email);

    const accountId = dto.accountId
      ? await this.getAccountIdOrFail(dto.accountId)
      : undefined;
    const customerId = dto.customerId
      ? await this.getCustomerIdOrFail(dto.customerId)
      : undefined;
    if (dto.isPrimary && !accountId) {
      throw new BadRequestException(
        'A primary contact must be linked to an account',
      );
    }

    const assignment = await this.resolveAssignmentTargets(
      dto.assignedToId,
      dto.assignedTeamId,
    );
    const customFields = await this.customFieldsService.validateAndMerge(
      'contact',
      undefined,
      dto.customFields,
      organizationId,
    );

    const contact = await this.contactModel.create({
      organizationId,
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      email,
      phone: dto.phone?.trim(),
      jobTitle: dto.jobTitle?.trim(),
      department: dto.department?.trim(),
      birthday: dto.birthday ? new Date(dto.birthday) : undefined,
      address: dto.address?.trim(),
      city: dto.city?.trim(),
      country: dto.country?.trim(),
      language: dto.language?.trim(),
      accountId,
      isPrimary: dto.isPrimary ?? false,
      customerId,
      preferredChannel: dto.preferredChannel ?? 'email',
      emailOptIn: dto.emailOptIn ?? true,
      phoneOptIn: dto.phoneOptIn ?? true,
      smsOptIn: dto.smsOptIn ?? false,
      doNotContact: dto.doNotContact ?? false,
      notes: dto.notes?.trim(),
      createdBy,
      customFields,
      ...assignment,
    });

    if (contact.isPrimary) {
      await this.demoteOtherPrimaries(contact);
    }

    this.logger.log(`Contact created: ${email}`);
    this.eventBus.emit({
      event: 'contact.created',
      recordType: 'contact',
      recordId: contact._id.toString(),
      record: contact.toObject() as unknown as Record<string, unknown>,
      context: {},
    });
    void this.auditService.log({
      organizationId,
      actor: { id: createdBy },
      action: 'create',
      entityType: 'contact',
      entityId: contact._id.toString(),
      entityLabel: `${contact.firstName} ${contact.lastName}`,
      summary: `Created contact "${contact.firstName} ${contact.lastName}"`,
      after: omitFields(contact.toObject(), ['interactions']),
    });
    return this.mapOne(contact);
  }

  // ── Read ────────────────────────────────────────────────────────────────

  private async buildListFilter(
    query: ContactQueryDto,
    requesterKeycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<Record<string, unknown>> {
    const conditions: Record<string, unknown>[] = [{ organizationId }];

    if (query.search?.trim()) {
      const searchRegex = new RegExp(escapeRegExp(query.search.trim()), 'i');
      conditions.push({
        $or: [
          { firstName: searchRegex },
          { lastName: searchRegex },
          { email: searchRegex },
          { phone: searchRegex },
          { jobTitle: searchRegex },
          { city: searchRegex },
          { country: searchRegex },
        ],
      });
    }

    if (query.accountId) {
      conditions.push({ accountId: new Types.ObjectId(query.accountId) });
    }
    if (query.preferredChannel) {
      conditions.push({ preferredChannel: query.preferredChannel });
    }
    if (query.doNotContact !== undefined) {
      conditions.push({ doNotContact: query.doNotContact === 'true' });
    }

    const visibility = await this.buildVisibilityFilter(
      requesterKeycloakId,
      organizationId,
    );
    if (visibility) conditions.push(visibility);

    return conditions.length === 0
      ? {}
      : conditions.length === 1
        ? conditions[0]
        : { $and: conditions };
  }

  async findAll(
    query: ContactQueryDto,
    requesterKeycloakId: string,
    organizationId: Types.ObjectId,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const filter = await this.buildListFilter(
      query,
      requesterKeycloakId,
      organizationId,
    );

    const sortBy = query.sortBy ?? 'createdAt';
    const direction = query.sortOrder === 'asc' ? 1 : -1;
    // Secondary _id sort keeps pagination stable when the primary key has ties
    const sort: Record<string, 1 | -1> = {
      [sortBy]: direction,
      _id: direction,
    };

    const [items, total, fieldRestrictions] = await Promise.all([
      this.contactModel.find(filter).sort(sort).skip(skip).limit(limit).exec(),
      this.contactModel.countDocuments(filter).exec(),
      this.getFieldRestrictions(requesterKeycloakId, organizationId),
    ]);

    return {
      data: await this.mapMany(items, fieldRestrictions),
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
  ): Promise<ContactStatsDto> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const visibility = {
      organizationId,
      ...((await this.buildVisibilityFilter(
        requesterKeycloakId,
        organizationId,
      )) ?? {}),
    };

    const [total, withAccount, doNotContact, newThisMonth, interactionsAgg] =
      await Promise.all([
        this.contactModel.countDocuments(visibility).exec(),
        this.contactModel
          .countDocuments({ ...visibility, accountId: { $exists: true } })
          .exec(),
        this.contactModel
          .countDocuments({ ...visibility, doNotContact: true })
          .exec(),
        this.contactModel
          .countDocuments({ ...visibility, createdAt: { $gte: startOfMonth } })
          .exec(),
        this.contactModel
          .aggregate<{
            _id: null;
            count: number;
          }>([
            { $match: visibility },
            { $unwind: '$interactions' },
            { $match: { 'interactions.occurredAt': { $gte: startOfMonth } } },
            { $group: { _id: null, count: { $sum: 1 } } },
          ])
          .exec(),
      ]);

    return {
      total,
      withAccount,
      doNotContact,
      newThisMonth,
      interactionsThisMonth: interactionsAgg[0]?.count ?? 0,
    };
  }

  async findOne(
    id: string,
    requesterKeycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<ContactResponseDto> {
    const contact = await this.getByIdOrFail(id, organizationId);
    await this.assertCanView(contact, requesterKeycloakId, organizationId);
    const fieldRestrictions = await this.getFieldRestrictions(
      requesterKeycloakId,
      organizationId,
    );
    return this.mapOne(contact, fieldRestrictions);
  }

  // ── Update ──────────────────────────────────────────────────────────────

  async update(
    id: string,
    dto: UpdateContactDto,
    requesterKeycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<ContactResponseDto> {
    const { fieldRestrictions } =
      await this.permissionsService.requirePermission(
        requesterKeycloakId,
        organizationId,
        'contact',
        'update',
      );
    const contact = await this.getByIdOrFail(id, organizationId);
    await this.assertCanView(contact, requesterKeycloakId, organizationId);
    const before = contact.toObject();

    if (dto.email !== undefined) {
      const newEmail = dto.email.trim().toLowerCase();
      if (newEmail !== contact.email) {
        await this.assertEmailAvailable(newEmail, contact._id);
        contact.email = newEmail;
      }
    }

    if (dto.firstName !== undefined) contact.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) contact.lastName = dto.lastName.trim();
    if (dto.phone !== undefined) contact.phone = dto.phone.trim();
    if (dto.jobTitle !== undefined) contact.jobTitle = dto.jobTitle.trim();
    if (dto.department !== undefined)
      contact.department = dto.department.trim();
    if (dto.birthday !== undefined)
      contact.birthday = dto.birthday ? new Date(dto.birthday) : undefined;
    if (dto.address !== undefined) contact.address = dto.address.trim();
    if (dto.city !== undefined) contact.city = dto.city.trim();
    if (dto.country !== undefined) contact.country = dto.country.trim();
    if (dto.language !== undefined) contact.language = dto.language.trim();

    // Account link: omitted = unchanged, null = unlink, id = validated & set
    if (dto.accountId !== undefined) {
      if (dto.accountId === null) {
        contact.accountId = undefined;
        contact.isPrimary = false;
      } else {
        contact.accountId = await this.getAccountIdOrFail(dto.accountId);
      }
    }

    // Customer link: same tri-state semantics
    if (dto.customerId !== undefined) {
      if (dto.customerId === null) {
        contact.customerId = undefined;
      } else {
        contact.customerId = await this.getCustomerIdOrFail(
          dto.customerId,
          contact._id,
        );
      }
    }

    if (dto.isPrimary !== undefined) {
      if (dto.isPrimary && !contact.accountId) {
        throw new BadRequestException(
          'A primary contact must be linked to an account',
        );
      }
      contact.isPrimary = dto.isPrimary;
    }

    if (dto.preferredChannel !== undefined)
      contact.preferredChannel = dto.preferredChannel;
    if (dto.emailOptIn !== undefined) contact.emailOptIn = dto.emailOptIn;
    if (dto.phoneOptIn !== undefined) contact.phoneOptIn = dto.phoneOptIn;
    if (dto.smsOptIn !== undefined) contact.smsOptIn = dto.smsOptIn;
    if (dto.doNotContact !== undefined) contact.doNotContact = dto.doNotContact;
    if (dto.notes !== undefined) contact.notes = dto.notes.trim();
    if (dto.customFields !== undefined) {
      const sanitized = this.permissionsService.stripReadonlyFieldChanges(
        contact.customFields,
        dto.customFields,
        fieldRestrictions,
      );
      contact.customFields = await this.customFieldsService.validateAndMerge(
        'contact',
        contact.customFields,
        sanitized,
        organizationId,
      );
    }

    await contact.save();

    if (contact.isPrimary && contact.accountId) {
      await this.demoteOtherPrimaries(contact);
    }

    this.logger.log(`Contact updated: ${id}`);
    const changes = diffFields(
      before,
      contact.toObject(),
      CONTACT_AUDIT_FIELDS,
    );
    if (changes.length > 0) {
      void this.auditService.log({
        organizationId,
        actor: { id: requesterKeycloakId },
        action: 'update',
        entityType: 'contact',
        entityId: id,
        entityLabel: `${contact.firstName} ${contact.lastName}`,
        summary: `Updated contact "${contact.firstName} ${contact.lastName}" (${changes.map((c) => c.field).join(', ')})`,
        changes,
      });
    }
    return this.mapOne(contact);
  }

  /** Log a communication touchpoint on the contact's history. */
  async addInteraction(
    id: string,
    dto: AddInteractionDto,
    requesterKeycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<ContactResponseDto> {
    await this.permissionsService.requirePermission(
      requesterKeycloakId,
      organizationId,
      'contact',
      'update',
    );
    const contact = await this.getByIdOrFail(id, organizationId);
    await this.assertCanView(contact, requesterKeycloakId, organizationId);

    contact.interactions.push({
      type: dto.type,
      direction: dto.direction,
      subject: dto.subject?.trim() || undefined,
      note: dto.note?.trim() || undefined,
      recordedBy: requesterKeycloakId,
      occurredAt: new Date(),
    });

    await contact.save();
    this.logger.log(`Interaction ${dto.type} logged on contact ${id}`);
    return this.mapOne(contact);
  }

  /**
   * Record routing: set or clear the record owner and/or the assigned team.
   * Omitted fields are unchanged; null clears a field.
   */
  async assign(
    id: string,
    dto: AssignContactDto,
    actor: AuditActor,
    organizationId: Types.ObjectId,
  ): Promise<ContactResponseDto> {
    await this.permissionsService.requirePermission(
      actor.id ?? '',
      organizationId,
      'contact',
      'update',
    );
    const contact = await this.getByIdOrFail(id, organizationId);

    const sets: Record<string, unknown> = {};
    const unsets: Record<string, ''> = {};
    // undefined = team untouched by this request; null = cleared
    let targetTeam: TeamDocument | null | undefined;

    if (dto.assignedTeamId !== undefined) {
      if (dto.assignedTeamId === null) {
        unsets.assignedTeamId = '';
        targetTeam = null;
      } else {
        targetTeam = await this.getActiveTeamOrFail(dto.assignedTeamId);
        sets.assignedTeamId = targetTeam._id;
      }
    }

    if (dto.assignedToId !== undefined) {
      if (dto.assignedToId === null) {
        unsets.assignedToId = '';
      } else {
        await this.getStaffUserOrFail(dto.assignedToId);
        sets.assignedToId = dto.assignedToId;
      }
    }

    if (Object.keys(sets).length === 0 && Object.keys(unsets).length === 0) {
      return this.mapOne(contact);
    }

    // Consistency rule: when the record ends up with both an owner and a
    // team, the owner must be a member of that team.
    const finalOwner =
      dto.assignedToId === undefined
        ? (contact.assignedToId ?? null)
        : dto.assignedToId;
    const finalTeam =
      targetTeam !== undefined
        ? targetTeam
        : contact.assignedTeamId
          ? await this.teamsService.findDocById(
              contact.assignedTeamId.toString(),
            )
          : null;

    if (finalOwner && finalTeam && !finalTeam.memberIds.includes(finalOwner)) {
      throw new BadRequestException(
        'Record owner must be a member of the assigned team',
      );
    }

    const updated = await this.contactModel
      .findByIdAndUpdate(
        id,
        {
          ...(Object.keys(sets).length > 0 ? { $set: sets } : {}),
          ...(Object.keys(unsets).length > 0 ? { $unset: unsets } : {}),
        },
        { new: true },
      )
      .orFail()
      .exec();

    this.logger.log(
      `Contact ${id} routed: owner=${updated.assignedToId ?? 'none'}, team=${updated.assignedTeamId?.toString() ?? 'none'}`,
    );
    void this.auditService.log({
      organizationId,
      actor,
      action: 'assign',
      entityType: 'contact',
      entityId: id,
      entityLabel: `${updated.firstName} ${updated.lastName}`,
      summary: `Reassigned contact "${updated.firstName} ${updated.lastName}"`,
      changes: diffFields(contact.toObject(), updated.toObject(), [
        'assignedToId',
        'assignedTeamId',
      ]),
    });
    if (dto.assignedToId) {
      void this.notificationsService.notify({
        organizationId,
        recipientId: updated.assignedToId,
        actorId: actor.id,
        type: 'assignment',
        title: 'Contact assigned to you',
        body: `${updated.firstName} ${updated.lastName}`,
        entityType: 'contact',
        entityId: updated._id,
      });
    }
    return this.mapOne(updated);
  }

  async remove(
    id: string,
    actor: AuditActor,
    organizationId: Types.ObjectId,
  ): Promise<void> {
    await this.permissionsService.requirePermission(
      actor.id ?? '',
      organizationId,
      'contact',
      'delete',
    );
    const contact = await this.getByIdOrFail(id, organizationId);
    await this.contactModel.deleteOne({ _id: contact._id }).exec();
    this.logger.log(`Contact deleted: ${id}`);
    void this.auditService.log({
      organizationId,
      actor,
      action: 'delete',
      entityType: 'contact',
      entityId: id,
      entityLabel: `${contact.firstName} ${contact.lastName}`,
      summary: `Deleted contact "${contact.firstName} ${contact.lastName}"`,
      before: omitFields(contact.toObject(), ['interactions']),
    });
  }

  // ── Row-level visibility (governed by PermissionsService) ──────────────

  private async buildVisibilityFilter(
    keycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<Record<string, unknown> | null> {
    const { scope } = await this.permissionsService.requirePermission(
      keycloakId,
      organizationId,
      'contact',
      'read',
    );
    if (scope === 'all') return null;
    const teamIds = await this.teamsService.getTeamIdsForMember(
      keycloakId,
      organizationId,
    );
    return this.permissionsService.buildVisibilityFilter(
      scope,
      keycloakId,
      teamIds,
    );
  }

  /** 404 (not 403) outside the caller's scope, to avoid leaking existence. */
  private async assertCanView(
    contact: ContactDocument,
    keycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<void> {
    const { scope } = await this.permissionsService.requirePermission(
      keycloakId,
      organizationId,
      'contact',
      'read',
    );
    const inScope = await this.permissionsService.isRecordInScope(
      scope,
      keycloakId,
      organizationId,
      contact,
    );
    if (!inScope) {
      throw new NotFoundException(
        `Contact with ID ${contact._id.toString()} not found`,
      );
    }
  }

  private async getFieldRestrictions(
    keycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<Map<string, FieldRestrictionInfo>> {
    const { fieldRestrictions } =
      await this.permissionsService.getEffectivePermission(
        keycloakId,
        organizationId,
        'contact',
        'read',
      );
    return fieldRestrictions;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private async assertEmailAvailable(
    email: string,
    excludeId?: Types.ObjectId,
  ): Promise<void> {
    const existing = await this.contactModel
      .findOne({
        email,
        ...(excludeId ? { _id: { $ne: excludeId } } : {}),
      })
      .exec();
    if (existing) {
      throw new ConflictException('A contact with this email already exists');
    }
  }

  /** At most one primary contact per account. */
  private async demoteOtherPrimaries(contact: ContactDocument): Promise<void> {
    await this.contactModel
      .updateMany(
        {
          accountId: contact.accountId,
          _id: { $ne: contact._id },
          isPrimary: true,
        },
        { $set: { isPrimary: false } },
      )
      .exec();
  }

  private async getAccountIdOrFail(accountId: string): Promise<Types.ObjectId> {
    const account = await this.accountsService.findDocById(accountId);
    if (!account) {
      throw new BadRequestException('Linked account not found');
    }
    return account._id;
  }

  /** Validate the customer link; a customer maps to at most one contact. */
  private async getCustomerIdOrFail(
    customerId: string,
    excludeContactId?: Types.ObjectId,
  ): Promise<Types.ObjectId> {
    const customer = await this.customersService.findDocById(customerId);
    if (!customer) {
      throw new BadRequestException('Linked customer not found');
    }
    const alreadyLinked = await this.contactModel
      .findOne({
        customerId: customer._id,
        ...(excludeContactId ? { _id: { $ne: excludeContactId } } : {}),
      })
      .exec();
    if (alreadyLinked) {
      throw new ConflictException(
        'This customer is already linked to another contact',
      );
    }
    return customer._id;
  }

  /** Validate optional routing targets on contact creation. */
  private async resolveAssignmentTargets(
    assignedToId?: string,
    assignedTeamId?: string,
  ): Promise<{ assignedToId?: string; assignedTeamId?: Types.ObjectId }> {
    const result: { assignedToId?: string; assignedTeamId?: Types.ObjectId } =
      {};

    let team: TeamDocument | null = null;
    if (assignedTeamId) {
      team = await this.getActiveTeamOrFail(assignedTeamId);
      result.assignedTeamId = team._id;
    }

    if (assignedToId) {
      await this.getStaffUserOrFail(assignedToId);
      if (team && !team.memberIds.includes(assignedToId)) {
        throw new BadRequestException(
          'Record owner must be a member of the assigned team',
        );
      }
      result.assignedToId = assignedToId;
    }

    return result;
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
      throw new BadRequestException(
        'Record owner must be an existing staff user',
      );
    }
  }

  // ── Mapping ─────────────────────────────────────────────────────────────

  private async mapOne(
    contact: ContactDocument,
    fieldRestrictions?: Map<string, FieldRestrictionInfo>,
  ): Promise<ContactResponseDto> {
    const [dto] = await this.mapMany([contact], fieldRestrictions);
    return dto;
  }

  /** Batch-denormalize staff/team/account names (one lookup per collection per page). */
  private async mapMany(
    contacts: ContactDocument[],
    fieldRestrictions: Map<string, FieldRestrictionInfo> = new Map(),
  ): Promise<ContactResponseDto[]> {
    if (contacts.length === 0) return [];

    const staffIds = [
      ...new Set(
        contacts
          .flatMap((c) => [
            c.assignedToId,
            ...c.interactions.map((i) => i.recordedBy),
          ])
          .filter((v): v is string => !!v),
      ),
    ];
    const teamIds = [
      ...new Set(
        contacts
          .map((c) => c.assignedTeamId?.toString())
          .filter((v): v is string => !!v),
      ),
    ];
    const accountIds = [
      ...new Set(
        contacts
          .map((c) => c.accountId?.toString())
          .filter((v): v is string => !!v),
      ),
    ];

    const [staff, teamNames, accountNames] = await Promise.all([
      this.usersService.findStaffByKeycloakIds(staffIds),
      this.teamsService.findNamesByIds(teamIds),
      this.accountsService.findNamesByIds(accountIds),
    ]);

    const staffNames = new Map(
      staff.map((u) => [
        u.keycloakId,
        `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email,
      ]),
    );

    return contacts.map((c) => {
      const dto = toContactResponseDto(c, {
        staffNames,
        teamNames,
        accountNames,
      });
      dto.customFields =
        this.permissionsService.applyFieldVisibility(
          dto.customFields,
          fieldRestrictions,
        ) ?? {};
      return dto;
    });
  }

  /** Load a contact by id, rejecting malformed ids with a 404 instead of a Mongoose CastError (500). */
  private async getByIdOrFail(
    id: string,
    organizationId: Types.ObjectId,
  ): Promise<ContactDocument> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Contact with ID ${id} not found`);
    }
    const contact = await this.contactModel
      .findOne({ _id: id, organizationId })
      .exec();
    if (!contact) {
      throw new NotFoundException(`Contact with ID ${id} not found`);
    }
    return contact;
  }

  // ── Import / export ─────────────────────────────────────────────────────

  async exportCsv(
    query: ContactQueryDto,
    requesterKeycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<string> {
    const filter = await this.buildListFilter(
      query,
      requesterKeycloakId,
      organizationId,
    );
    const contacts = await this.contactModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(EXPORT_ROW_LIMIT)
      .exec();

    const header = [
      'First Name',
      'Last Name',
      'Email',
      'Phone',
      'Job Title',
      'Department',
      'City',
      'Country',
      'Preferred Channel',
      'Do Not Contact',
      'Created At',
    ];
    const rows = contacts.map((c) => [
      c.firstName,
      c.lastName,
      c.email,
      c.phone ?? '',
      c.jobTitle ?? '',
      c.department ?? '',
      c.city ?? '',
      c.country ?? '',
      c.preferredChannel,
      c.doNotContact ? 'true' : 'false',
      c.createdAt?.toISOString() ?? '',
    ]);
    return toCsv(header, rows);
  }

  async importCsv(
    fileBuffer: Buffer,
    createdBy: string,
    organizationId: Types.ObjectId,
  ): Promise<ImportResultDto> {
    const { records } = parseCsvToRecords(fileBuffer.toString('utf-8'));
    if (records.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException(
        `CSV exceeds the ${MAX_IMPORT_ROWS}-row import limit`,
      );
    }

    return runImport(records, async (record) => {
      const dto = plainToInstance(CreateContactDto, {
        firstName: record.firstname || record['first name'],
        lastName: record.lastname || record['last name'],
        email: record.email,
        phone: record.phone || undefined,
        jobTitle: record.jobtitle || record['job title'] || undefined,
        department: record.department || undefined,
        city: record.city || undefined,
        country: record.country || undefined,
      });
      const validationErrors = await validate(dto, { whitelist: true });
      if (validationErrors.length > 0) {
        throw new BadRequestException(
          validationErrors
            .map((e) => Object.values(e.constraints ?? {}).join('; '))
            .join('; '),
        );
      }
      await this.create(dto, createdBy, organizationId);
    });
  }
}
