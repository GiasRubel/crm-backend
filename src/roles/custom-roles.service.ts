import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { AuditActor, AuditService, diffFields } from '../audit/audit.service';
import { User, UserDocument } from '../users/users.schema';
import { CustomRole, CustomRoleDocument } from './custom-role.schema';
import { CreateCustomRoleDto } from './dto/create-custom-role.dto';
import { CustomRoleResponseDto } from './dto/custom-role-response.dto';
import { UpdateCustomRoleDto } from './dto/update-custom-role.dto';
import { toCustomRoleResponseDto } from './mappers/custom-role.mapper';

/** Escape user input so it can be safely embedded in a RegExp. */
function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class CustomRolesService {
  private readonly logger = new Logger(CustomRolesService.name);

  constructor(
    @InjectModel(CustomRole.name)
    private readonly roleModel: Model<CustomRoleDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly auditService: AuditService,
  ) {}

  async create(
    dto: CreateCustomRoleDto,
    actor: AuditActor,
    organizationId: Types.ObjectId,
  ): Promise<CustomRoleResponseDto> {
    const name = dto.name.trim();
    await this.assertNameAvailable(name, organizationId);

    const role = await this.roleModel.create({
      organizationId,
      name,
      description: dto.description?.trim(),
      permissions: dto.permissions ?? [],
      fieldRestrictions: dto.fieldRestrictions ?? [],
    });

    this.logger.log(
      `Custom role created: "${role.name}" (${role._id.toString()})`,
    );
    void this.auditService.log({
      organizationId,
      actor,
      action: 'create',
      entityType: 'custom_role',
      entityId: role._id.toString(),
      entityLabel: role.name,
      summary: `Created role "${role.name}"`,
      after: role.toObject(),
    });
    return toCustomRoleResponseDto(role);
  }

  async findAll(
    organizationId: Types.ObjectId,
  ): Promise<CustomRoleResponseDto[]> {
    const roles = await this.roleModel
      .find({ organizationId })
      .sort({ name: 1 })
      .exec();
    if (roles.length === 0) return [];

    const counts = await this.userModel
      .aggregate<{ _id: Types.ObjectId; count: number }>([
        {
          $match: {
            organizationId,
            customRoleId: { $in: roles.map((r) => r._id) },
          },
        },
        { $group: { _id: '$customRoleId', count: { $sum: 1 } } },
      ])
      .exec();
    const countByRole = new Map(counts.map((c) => [c._id.toString(), c.count]));

    return roles.map((r) =>
      toCustomRoleResponseDto(r, countByRole.get(r._id.toString()) ?? 0),
    );
  }

  async findOne(
    id: string,
    organizationId: Types.ObjectId,
  ): Promise<CustomRoleResponseDto> {
    const role = await this.getByIdOrFail(id, organizationId);
    const userCount = await this.userModel
      .countDocuments({ organizationId, customRoleId: role._id })
      .exec();
    return toCustomRoleResponseDto(role, userCount);
  }

  async update(
    id: string,
    dto: UpdateCustomRoleDto,
    actor: AuditActor,
    organizationId: Types.ObjectId,
  ): Promise<CustomRoleResponseDto> {
    const role = await this.getByIdOrFail(id, organizationId);
    const before = role.toObject();

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (name.toLowerCase() !== role.name.toLowerCase()) {
        await this.assertNameAvailable(name, organizationId);
      }
      role.name = name;
    }
    if (dto.description !== undefined)
      role.description = dto.description.trim();
    if (dto.permissions !== undefined) role.permissions = dto.permissions;
    if (dto.fieldRestrictions !== undefined) {
      role.fieldRestrictions = dto.fieldRestrictions.map((f) => ({
        entityType: f.entityType,
        fieldKey: f.fieldKey,
        hidden: f.hidden ?? false,
        readonly: f.readonly ?? false,
      }));
    }

    await role.save();
    this.logger.log(`Custom role updated: ${role.name} (${id})`);
    const changes = diffFields(before, role.toObject(), [
      'name',
      'description',
      'permissions',
      'fieldRestrictions',
    ]);
    if (changes.length > 0) {
      void this.auditService.log({
        organizationId,
        actor,
        action: 'update',
        entityType: 'custom_role',
        entityId: id,
        entityLabel: role.name,
        summary: `Updated role "${role.name}" (${changes.map((c) => c.field).join(', ')})`,
        changes,
      });
    }
    const userCount = await this.userModel
      .countDocuments({ organizationId, customRoleId: role._id })
      .exec();
    return toCustomRoleResponseDto(role, userCount);
  }

  async remove(
    id: string,
    actor: AuditActor,
    organizationId: Types.ObjectId,
  ): Promise<void> {
    const role = await this.getByIdOrFail(id, organizationId);

    const userCount = await this.userModel
      .countDocuments({ organizationId, customRoleId: role._id })
      .exec();
    if (userCount > 0) {
      throw new BadRequestException(
        `Cannot delete a role assigned to ${userCount} user(s) — reassign them first`,
      );
    }

    await this.roleModel.deleteOne({ _id: role._id }).exec();
    this.logger.log(`Custom role deleted: ${role.name} (${id})`);
    void this.auditService.log({
      organizationId,
      actor,
      action: 'delete',
      entityType: 'custom_role',
      entityId: id,
      entityLabel: role.name,
      summary: `Deleted role "${role.name}"`,
      before: role.toObject(),
    });
  }

  private async assertNameAvailable(
    name: string,
    organizationId: Types.ObjectId,
  ): Promise<void> {
    const existing = await this.roleModel
      .findOne({
        organizationId,
        name: { $regex: `^${escapeRegExp(name)}$`, $options: 'i' },
      })
      .exec();
    if (existing) {
      throw new ConflictException('A role with this name already exists');
    }
  }

  private async getByIdOrFail(
    id: string,
    organizationId: Types.ObjectId,
  ): Promise<CustomRoleDocument> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Role with ID ${id} not found`);
    }
    const role = await this.roleModel
      .findOne({ _id: id, organizationId })
      .exec();
    if (!role) {
      throw new NotFoundException(`Role with ID ${id} not found`);
    }
    return role;
  }
}
