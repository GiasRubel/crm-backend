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
import {
  CUSTOM_FIELD_CHOICE_TYPES,
  CustomFieldDefinition,
  CustomFieldDocument,
  CustomFieldEntityType,
} from './custom-field-definition.schema';
import { CreateCustomFieldDefinitionDto } from './dto/create-custom-field-definition.dto';
import { CustomFieldDefinitionQueryDto } from './dto/custom-field-definition-query.dto';
import { CustomFieldDefinitionResponseDto } from './dto/custom-field-definition-response.dto';
import { UpdateCustomFieldDefinitionDto } from './dto/update-custom-field-definition.dto';
import { toCustomFieldDefinitionResponseDto } from './mappers/custom-field-definition.mapper';

const DEFINITION_AUDIT_FIELDS = [
  'label',
  'type',
  'options',
  'required',
  'isActive',
  'order',
  'helpText',
];

@Injectable()
export class CustomFieldsService {
  private readonly logger = new Logger(CustomFieldsService.name);

  constructor(
    @InjectModel(CustomFieldDefinition.name)
    private readonly definitionModel: Model<CustomFieldDocument>,
    private readonly auditService: AuditService,
  ) {}

  async create(
    dto: CreateCustomFieldDefinitionDto,
    actor: AuditActor,
    organizationId: Types.ObjectId,
  ): Promise<CustomFieldDefinitionResponseDto> {
    if (
      CUSTOM_FIELD_CHOICE_TYPES.includes(dto.type) &&
      (!dto.options || dto.options.length === 0)
    ) {
      throw new BadRequestException(
        `Field type "${dto.type}" requires at least one option`,
      );
    }

    const existing = await this.definitionModel
      .findOne({ organizationId, entityType: dto.entityType, key: dto.key })
      .exec();
    if (existing) {
      throw new ConflictException(
        `A custom field with key "${dto.key}" already exists on ${dto.entityType}`,
      );
    }

    const doc = await this.definitionModel.create({
      organizationId,
      entityType: dto.entityType,
      key: dto.key,
      label: dto.label.trim(),
      type: dto.type,
      options: dto.options ?? [],
      required: dto.required ?? false,
      isActive: dto.isActive ?? true,
      order: dto.order ?? 0,
      helpText: dto.helpText?.trim(),
    });

    this.logger.log(`Custom field defined: ${dto.entityType}.${dto.key}`);
    void this.auditService.log({
      organizationId,
      actor,
      action: 'create',
      entityType: 'custom_field_definition',
      entityId: doc._id.toString(),
      entityLabel: `${doc.entityType}.${doc.key}`,
      summary: `Added custom field "${doc.label}" to ${doc.entityType}`,
    });
    return toCustomFieldDefinitionResponseDto(doc);
  }

  async findAll(
    query: CustomFieldDefinitionQueryDto,
    organizationId: Types.ObjectId,
  ): Promise<CustomFieldDefinitionResponseDto[]> {
    const filter: Record<string, unknown> = { organizationId };
    if (query.entityType) filter.entityType = query.entityType;
    if (query.activeOnly === 'true') filter.isActive = true;

    const docs = await this.definitionModel
      .find(filter)
      .sort({ entityType: 1, order: 1, createdAt: 1 })
      .exec();
    return docs.map(toCustomFieldDefinitionResponseDto);
  }

  async update(
    id: string,
    dto: UpdateCustomFieldDefinitionDto,
    actor: AuditActor,
    organizationId: Types.ObjectId,
  ): Promise<CustomFieldDefinitionResponseDto> {
    const doc = await this.getByIdOrFail(id, organizationId);
    const before = doc.toObject();

    const nextType = dto.type ?? doc.type;
    const nextOptions = dto.options ?? doc.options;
    if (
      CUSTOM_FIELD_CHOICE_TYPES.includes(nextType) &&
      nextOptions.length === 0
    ) {
      throw new BadRequestException(
        `Field type "${nextType}" requires at least one option`,
      );
    }

    if (dto.label !== undefined) doc.label = dto.label.trim();
    if (dto.type !== undefined) doc.type = dto.type;
    if (dto.options !== undefined) doc.options = dto.options;
    if (dto.required !== undefined) doc.required = dto.required;
    if (dto.isActive !== undefined) doc.isActive = dto.isActive;
    if (dto.order !== undefined) doc.order = dto.order;
    if (dto.helpText !== undefined) doc.helpText = dto.helpText.trim();

    await doc.save();
    this.logger.log(`Custom field updated: ${doc.entityType}.${doc.key}`);

    const changes = diffFields(before, doc.toObject(), DEFINITION_AUDIT_FIELDS);
    if (changes.length > 0) {
      void this.auditService.log({
        organizationId,
        actor,
        action: 'update',
        entityType: 'custom_field_definition',
        entityId: id,
        entityLabel: `${doc.entityType}.${doc.key}`,
        summary: `Updated custom field "${doc.label}" (${changes.map((c) => c.field).join(', ')})`,
        changes,
      });
    }
    return toCustomFieldDefinitionResponseDto(doc);
  }

  async remove(
    id: string,
    actor: AuditActor,
    organizationId: Types.ObjectId,
  ): Promise<void> {
    const doc = await this.getByIdOrFail(id, organizationId);
    await this.definitionModel.deleteOne({ _id: doc._id }).exec();
    this.logger.log(`Custom field removed: ${doc.entityType}.${doc.key}`);
    void this.auditService.log({
      organizationId,
      actor,
      action: 'delete',
      entityType: 'custom_field_definition',
      entityId: id,
      entityLabel: `${doc.entityType}.${doc.key}`,
      summary: `Removed custom field "${doc.label}" from ${doc.entityType}`,
    });
  }

  /**
   * Merge a partial `patch` of custom-field values into `existing`, validate
   * the result against this org's active definitions for `entityType`, and
   * return the merged+validated map to store. Unknown keys (no matching
   * definition) are dropped. Called by every entity service's create/update.
   */
  async validateAndMerge(
    entityType: CustomFieldEntityType,
    existing: Record<string, unknown> | undefined,
    patch: Record<string, unknown> | undefined,
    organizationId: Types.ObjectId,
  ): Promise<Record<string, unknown>> {
    if (patch === undefined) return existing ?? {};

    const definitions = await this.definitionModel
      .find({ organizationId, entityType, isActive: true })
      .exec();

    const merged: Record<string, unknown> = { ...existing };
    for (const def of definitions) {
      if (!(def.key in patch)) continue;
      const value = patch[def.key];
      merged[def.key] = this.coerceAndValidate(def, value);
    }

    for (const def of definitions) {
      const value = merged[def.key];
      if (
        def.required &&
        (value === undefined || value === null || value === '')
      ) {
        throw new BadRequestException(
          `Custom field "${def.label}" is required`,
        );
      }
    }

    return merged;
  }

  private coerceAndValidate(def: CustomFieldDocument, value: unknown): unknown {
    if (value === null || value === undefined || value === '') return null;

    switch (def.type) {
      case 'number': {
        const n = typeof value === 'number' ? value : Number(value);
        if (Number.isNaN(n)) {
          throw new BadRequestException(
            `Custom field "${def.label}" must be a number`,
          );
        }
        return n;
      }
      case 'boolean':
        return Boolean(value);
      case 'date': {
        const d = new Date(value as string);
        if (Number.isNaN(d.getTime())) {
          throw new BadRequestException(
            `Custom field "${def.label}" must be a valid date`,
          );
        }
        return d.toISOString();
      }
      case 'select': {
        if (typeof value !== 'string' || !def.options.includes(value)) {
          throw new BadRequestException(
            `Custom field "${def.label}" must be one of: ${def.options.join(', ')}`,
          );
        }
        return value;
      }
      case 'multiselect': {
        if (
          !Array.isArray(value) ||
          !value.every((v) => def.options.includes(v))
        ) {
          throw new BadRequestException(
            `Custom field "${def.label}" must be a subset of: ${def.options.join(', ')}`,
          );
        }
        return value;
      }
      default:
        if (typeof value === 'string') return value;
        if (typeof value === 'number' || typeof value === 'boolean') {
          return value.toString();
        }
        throw new BadRequestException(
          `Custom field "${def.label}" has an invalid value`,
        );
    }
  }

  private async getByIdOrFail(
    id: string,
    organizationId: Types.ObjectId,
  ): Promise<CustomFieldDocument> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Custom field with ID ${id} not found`);
    }
    const doc = await this.definitionModel
      .findOne({ _id: id, organizationId })
      .exec();
    if (!doc) {
      throw new NotFoundException(`Custom field with ID ${id} not found`);
    }
    return doc;
  }
}
