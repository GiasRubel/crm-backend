import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { CrmEventBus } from '../events/crm-event-bus.service';
import { KeycloakAdminService } from '../keycloak-admin/keycloak-admin.service';
import { TeamDocument } from '../teams/team.schema';
import { TeamsService } from '../teams/teams.service';
import { AppRole } from '../users/app-role.enum';
import { UsersService } from '../users/users.service';
import { Customer, CustomerDocument } from './customer.schema';
import { AssignCustomerDto } from './dto/assign-customer.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { CustomerResponseDto } from './dto/customer-response.dto';
import { CustomerStatsDto } from './dto/customer-stats.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { toCustomerResponseDto } from './mappers/customer.mapper';

/** Escape user input so it can be safely embedded in a RegExp. */
function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
    private readonly usersService: UsersService,
    private readonly keycloakAdminService: KeycloakAdminService,
    private readonly teamsService: TeamsService,
    private readonly eventBus: CrmEventBus,
  ) {}

  async create(
    dto: CreateCustomerDto,
    createdBy: string,
    organizationId: Types.ObjectId,
  ): Promise<CustomerResponseDto> {
    const email = dto.email.trim().toLowerCase();

    // 1. Verify email uniqueness in MongoDB collections
    const existingCustomer = await this.customerModel.findOne({ email }).exec();
    if (existingCustomer) {
      throw new ConflictException('A customer with this email already exists');
    }

    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
    }

    // Validate routing targets before any external write, so a bad
    // assignment can never leave an orphaned Keycloak user behind.
    const assignment = await this.resolveAssignmentTargets(
      dto.assignedToId,
      dto.assignedTeamId,
    );

    // 2. Create user in Keycloak identity provider
    let keycloakId: string;
    try {
      keycloakId = await this.keycloakAdminService.createUser(
        email,
        dto.firstName.trim(),
        dto.lastName.trim(),
      );
    } catch (error) {
      this.logger.error(`Failed to create Keycloak user for ${email}:`, error);
      throw error;
    }

    // 3. Provision MongoDB collections (User and Customer) with rollback protection
    let createdUserDoc = false;
    let createdCustomerDoc: CustomerDocument | null = null;

    try {
      // Create user document with Customer role
      await this.usersService.createCustomerUser(
        keycloakId,
        email,
        dto.firstName,
        dto.lastName,
        organizationId,
      );
      createdUserDoc = true;

      const status = dto.status ?? 'active';

      // Create detailed customer profile document
      createdCustomerDoc = await this.customerModel.create({
        organizationId,
        keycloakId,
        email,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phone: dto.phone.trim(),
        company: dto.company?.trim(),
        address: dto.address?.trim(),
        notes: dto.notes?.trim(),
        status,
        createdBy,
        ...assignment,
      });

      // Inactive customers must not be able to sign in — best-effort, like mail
      if (status === 'inactive') {
        try {
          await this.keycloakAdminService.updateUser(keycloakId, {
            enabled: false,
          });
        } catch (error) {
          this.logger.error(
            `Failed to disable Keycloak login for ${email}:`,
            error,
          );
        }
      }

      // 4. Send action invitation email via Keycloak
      try {
        await this.keycloakAdminService.sendSetPasswordEmail(keycloakId);
      } catch (emailError) {
        this.logger.error(
          `Customer created successfully, but Keycloak failed to send the initial invitation email to ${email}:`,
          emailError,
        );
      }

      this.eventBus.emit({
        event: 'customer.created',
        recordType: 'customer',
        recordId: createdCustomerDoc._id.toString(),
        record: createdCustomerDoc.toObject() as unknown as Record<
          string,
          unknown
        >,
        context: {},
      });

      return await this.mapOne(createdCustomerDoc);
    } catch (error) {
      this.logger.error(
        `Failed to write customer data to MongoDB. Triggering rollback for Keycloak user ${keycloakId}`,
        error,
      );

      // Rollback database writes if any succeeded
      if (createdCustomerDoc) {
        await this.customerModel
          .deleteOne({ _id: createdCustomerDoc._id })
          .exec();
      }
      if (createdUserDoc) {
        await this.usersService.deleteByKeycloakId(keycloakId);
      }

      // Rollback Keycloak user creation
      try {
        await this.keycloakAdminService.deleteUser(keycloakId);
      } catch (kcError) {
        this.logger.error(
          `Rollback critical failure: could not delete Keycloak user ${keycloakId}:`,
          kcError,
        );
      }

      if (
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Failed to create customer profile.',
      );
    }
  }

  async findAll(
    query: CustomerQueryDto,
    requesterKeycloakId: string,
    organizationId: Types.ObjectId,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const conditions: Record<string, unknown>[] = [{ organizationId }];

    if (query.search?.trim()) {
      const searchRegex = new RegExp(escapeRegExp(query.search.trim()), 'i');
      conditions.push({
        $or: [
          { firstName: searchRegex },
          { lastName: searchRegex },
          { email: searchRegex },
          { company: searchRegex },
          { phone: searchRegex },
        ],
      });
    }

    if (query.status) {
      conditions.push({ status: query.status });
    }

    // Row-level security: non-admin staff only see records in their scope
    const visibility = await this.buildVisibilityFilter(
      requesterKeycloakId,
      organizationId,
    );
    if (visibility) {
      conditions.push(visibility);
    }

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
      this.customerModel.find(filter).sort(sort).skip(skip).limit(limit).exec(),
      this.customerModel.countDocuments(filter).exec(),
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
  ): Promise<CustomerStatsDto> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // Stats reflect the caller's visible scope, same as the list
    const visibility = {
      organizationId,
      ...((await this.buildVisibilityFilter(
        requesterKeycloakId,
        organizationId,
      )) ?? {}),
    };

    const [byStatus, total, newThisMonth] = await Promise.all([
      this.customerModel
        .aggregate<{
          _id: string;
          count: number;
        }>([
          { $match: visibility },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ])
        .exec(),
      this.customerModel.countDocuments(visibility).exec(),
      this.customerModel
        .countDocuments({ ...visibility, createdAt: { $gte: startOfMonth } })
        .exec(),
    ]);

    const counts = Object.fromEntries(byStatus.map((s) => [s._id, s.count]));

    return {
      total,
      active: counts['active'] ?? 0,
      inactive: counts['inactive'] ?? 0,
      prospect: counts['prospect'] ?? 0,
      newThisMonth,
    };
  }

  async findOne(
    id: string,
    requesterKeycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<CustomerResponseDto> {
    const customer = await this.getByIdOrFail(id, organizationId);
    await this.assertCanView(customer, requesterKeycloakId, organizationId);
    return this.mapOne(customer);
  }

  /** Profile of the currently signed-in customer (Customer role). */
  async findMyProfile(keycloakId: string): Promise<CustomerResponseDto> {
    const customer = await this.customerModel.findOne({ keycloakId }).exec();
    if (!customer) {
      throw new NotFoundException(
        'No customer profile is linked to this account',
      );
    }
    return this.mapOne(customer);
  }

  async update(
    id: string,
    dto: UpdateCustomerDto,
    organizationId: Types.ObjectId,
  ): Promise<CustomerResponseDto> {
    const customer = await this.getByIdOrFail(id, organizationId);

    const updates: Partial<Customer> = {};
    const userUpdates: Record<string, string> = {};
    const keycloakUpdates: {
      email?: string;
      firstName?: string;
      lastName?: string;
      enabled?: boolean;
    } = {};

    if (dto.email !== undefined) {
      const newEmail = dto.email.trim().toLowerCase();
      if (newEmail !== customer.email) {
        // Validate email uniqueness
        const existingCustomer = await this.customerModel
          .findOne({ email: newEmail })
          .exec();
        if (existingCustomer) {
          throw new ConflictException(
            'A customer with this email already exists',
          );
        }
        const existingUser = await this.usersService.findByEmail(newEmail);
        if (existingUser && existingUser.keycloakId !== customer.keycloakId) {
          throw new ConflictException('A user with this email already exists');
        }

        updates.email = newEmail;
        userUpdates.email = newEmail;
        keycloakUpdates.email = newEmail;
      }
    }

    if (dto.firstName !== undefined) {
      const newFirst = dto.firstName.trim();
      if (newFirst !== customer.firstName) {
        updates.firstName = newFirst;
        userUpdates.firstName = newFirst;
        keycloakUpdates.firstName = newFirst;
      }
    }

    if (dto.lastName !== undefined) {
      const newLast = dto.lastName.trim();
      if (newLast !== customer.lastName) {
        updates.lastName = newLast;
        userUpdates.lastName = newLast;
        keycloakUpdates.lastName = newLast;
      }
    }

    if (dto.phone !== undefined) updates.phone = dto.phone.trim();
    if (dto.company !== undefined) updates.company = dto.company.trim();
    if (dto.address !== undefined) updates.address = dto.address.trim();
    if (dto.notes !== undefined) updates.notes = dto.notes.trim();
    if (dto.status !== undefined && dto.status !== customer.status) {
      updates.status = dto.status;
      // Lifecycle drives sign-in ability: inactive customers are locked out of Keycloak
      keycloakUpdates.enabled = dto.status !== 'inactive';
    }

    // 1. Sync identity/lifecycle fields to Keycloak Identity Provider
    if (Object.keys(keycloakUpdates).length > 0) {
      try {
        await this.keycloakAdminService.updateUser(
          customer.keycloakId,
          keycloakUpdates,
        );
      } catch (error) {
        this.logger.error(
          `Failed to update Keycloak user identity ${customer.keycloakId}:`,
          error,
        );
        throw error;
      }
    }

    // 2. Sync profile fields to MongoDB User collection
    if (Object.keys(userUpdates).length > 0) {
      const userDoc = await this.usersService.findByKeycloakId(
        customer.keycloakId,
      );
      if (userDoc) {
        Object.assign(userDoc, userUpdates);
        await userDoc.save();
      }
    }

    // 3. Sync profile fields to MongoDB Customer collection
    const updatedCustomer = await this.customerModel
      .findByIdAndUpdate(id, { $set: updates }, { new: true })
      .orFail()
      .exec();

    this.logger.log(`Customer profile updated: ${id}`);
    return this.mapOne(updatedCustomer);
  }

  /**
   * Record routing: set or clear the record owner and/or the assigned team.
   * Omitted fields are unchanged; null clears a field.
   */
  async assign(
    id: string,
    dto: AssignCustomerDto,
    organizationId: Types.ObjectId,
  ): Promise<CustomerResponseDto> {
    const customer = await this.getByIdOrFail(id, organizationId);

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
      return this.mapOne(customer);
    }

    // Consistency rule: when the record ends up with both an owner and a
    // team, the owner must be a member of that team.
    const finalOwner =
      dto.assignedToId === undefined
        ? (customer.assignedToId ?? null)
        : dto.assignedToId;
    const finalTeam =
      targetTeam !== undefined
        ? targetTeam
        : customer.assignedTeamId
          ? await this.teamsService.findDocById(
              customer.assignedTeamId.toString(),
            )
          : null;

    if (finalOwner && finalTeam && !finalTeam.memberIds.includes(finalOwner)) {
      throw new BadRequestException(
        'Record owner must be a member of the assigned team',
      );
    }

    const updated = await this.customerModel
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
      `Customer ${id} routed: owner=${updated.assignedToId ?? 'none'}, team=${updated.assignedTeamId?.toString() ?? 'none'}`,
    );
    return this.mapOne(updated);
  }

  async remove(id: string, organizationId: Types.ObjectId): Promise<void> {
    const customer = await this.getByIdOrFail(id, organizationId);

    // 1. Delete in Keycloak
    try {
      await this.keycloakAdminService.deleteUser(customer.keycloakId);
    } catch (error) {
      this.logger.error(
        `Failed to delete Keycloak user ${customer.keycloakId}:`,
        error,
      );
    }

    // 2. Delete MongoDB user
    await this.usersService.deleteByKeycloakId(customer.keycloakId);

    // 3. Delete MongoDB customer
    await this.customerModel.deleteOne({ _id: id }).exec();

    this.logger.log(`Customer deleted: ${id}`);
  }

  async resendInvitation(
    id: string,
    organizationId: Types.ObjectId,
  ): Promise<void> {
    const customer = await this.getByIdOrFail(id, organizationId);
    await this.keycloakAdminService.sendSetPasswordEmail(customer.keycloakId);
    this.logger.log(
      `Resent password setup email to customer ${customer.email}`,
    );
  }

  // ── Cross-module lookups (used by opportunities/leads) ─────────────────

  /** Raw document lookup for other modules; null for malformed/unknown ids. */
  async findDocById(id: string): Promise<CustomerDocument | null> {
    if (!isValidObjectId(id)) return null;
    return this.customerModel.findById(id).exec();
  }

  /** Portal identity → customer document (used by the tickets portal). */
  async findDocByKeycloakId(
    keycloakId: string,
  ): Promise<CustomerDocument | null> {
    return this.customerModel.findOne({ keycloakId }).exec();
  }

  /** Map of customer id → display name for response denormalization. */
  async findNamesByIds(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const customers = await this.customerModel
      .find({ _id: { $in: ids } })
      .select('firstName lastName company')
      .exec();
    return new Map(
      customers.map((c) => [
        c._id.toString(),
        `${c.firstName} ${c.lastName}`.trim() +
          (c.company ? ` (${c.company})` : ''),
      ]),
    );
  }

  // ── Row-level visibility ────────────────────────────────────────────────

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

  /** 404 (not 403) when a restricted caller reads a record outside their scope, to avoid leaking existence. */
  private async assertCanView(
    customer: CustomerDocument,
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
      customer.assignedToId === keycloakId ||
      customer.createdBy === keycloakId
    ) {
      return;
    }
    if (customer.assignedTeamId) {
      const teamIds = await this.teamsService.getTeamIdsForMember(
        keycloakId,
        organizationId,
      );
      if (teamIds.some((teamId) => teamId.equals(customer.assignedTeamId))) {
        return;
      }
    }
    throw new NotFoundException(
      `Customer with ID ${customer._id.toString()} not found`,
    );
  }

  // ── Assignment helpers ──────────────────────────────────────────────────

  /** Validate optional routing targets on customer creation. */
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
    customer: CustomerDocument,
  ): Promise<CustomerResponseDto> {
    const [dto] = await this.mapMany([customer]);
    return dto;
  }

  /** Batch-denormalize owner/team names into responses (one lookup per collection per page). */
  private async mapMany(
    customers: CustomerDocument[],
  ): Promise<CustomerResponseDto[]> {
    if (customers.length === 0) return [];

    const ownerIds = [
      ...new Set(
        customers.map((c) => c.assignedToId).filter((v): v is string => !!v),
      ),
    ];
    const teamIds = [
      ...new Set(
        customers
          .map((c) => c.assignedTeamId?.toString())
          .filter((v): v is string => !!v),
      ),
    ];

    const [owners, teamNames] = await Promise.all([
      this.usersService.findStaffByKeycloakIds(ownerIds),
      this.teamsService.findNamesByIds(teamIds),
    ]);

    const ownerNames = new Map(
      owners.map((u) => [
        u.keycloakId,
        `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email,
      ]),
    );

    return customers.map((c) =>
      toCustomerResponseDto(c, { ownerNames, teamNames }),
    );
  }

  /** Load a customer by id, rejecting malformed ids with a 404 instead of a Mongoose CastError (500). */
  private async getByIdOrFail(
    id: string,
    organizationId: Types.ObjectId,
  ): Promise<CustomerDocument> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Customer with ID ${id} not found`);
    }
    const customer = await this.customerModel
      .findOne({ _id: id, organizationId })
      .exec();
    if (!customer) {
      throw new NotFoundException(`Customer with ID ${id} not found`);
    }
    return customer;
  }
}
