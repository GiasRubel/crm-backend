import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { KeycloakJwtPayload } from '../auth/interfaces/keycloak-jwt-payload.interface';
import { UsersService } from '../users/users.service';
import {
  AuditAction,
  AuditEntityType,
  AuditFieldChange,
  AuditLog,
  AuditLogDocument,
} from './audit-log.schema';
import { AuditLogResponseDto } from './dto/audit-log-response.dto';
import { AuditQueryDto } from './dto/audit-query.dto';
import { toAuditLogResponseDto } from './mappers/audit.mapper';

/** Escape user input so it can be safely embedded in a RegExp. */
function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface AuditActor {
  id?: string;
  name?: string;
  email?: string;
}

export interface AuditLogEntry {
  organizationId: Types.ObjectId;
  actor?: AuditActor;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string;
  entityLabel?: string;
  summary: string;
  changes?: AuditFieldChange[];
  before?: object | null;
  after?: object | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectModel(AuditLog.name)
    private readonly auditLogModel: Model<AuditLogDocument>,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Record one audit entry. Never throws — a failed audit write must never
   * break the operation it's recording (same discipline as CrmEventBus).
   */
  async log(entry: AuditLogEntry): Promise<void> {
    try {
      await this.auditLogModel.create({
        organizationId: entry.organizationId,
        actorId: entry.actor?.id,
        actorName: entry.actor?.name,
        actorEmail: entry.actor?.email,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        entityLabel: entry.entityLabel,
        summary: entry.summary,
        changes: entry.changes ?? [],
        before: entry.before ?? undefined,
        after: entry.after ?? undefined,
        metadata: entry.metadata,
      });
    } catch (error) {
      this.logger.error(
        `Failed to write audit log entry (${entry.action} ${entry.entityType} ${entry.entityId ?? ''}):`,
        error,
      );
    }
  }

  async findAll(query: AuditQueryDto, organizationId: Types.ObjectId) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 25, 100);
    const skip = (page - 1) * limit;

    const conditions: Record<string, unknown>[] = [{ organizationId }];

    if (query.entityType) conditions.push({ entityType: query.entityType });
    if (query.entityId) conditions.push({ entityId: query.entityId });
    if (query.action) conditions.push({ action: query.action });
    if (query.actorId) conditions.push({ actorId: query.actorId });

    if (query.search?.trim()) {
      const searchRegex = new RegExp(escapeRegExp(query.search.trim()), 'i');
      conditions.push({
        $or: [
          { summary: searchRegex },
          { entityLabel: searchRegex },
          { actorName: searchRegex },
        ],
      });
    }

    if (query.dateFrom || query.dateTo) {
      const range: Record<string, Date> = {};
      if (query.dateFrom) range.$gte = new Date(query.dateFrom);
      if (query.dateTo) range.$lte = new Date(query.dateTo);
      conditions.push({ createdAt: range });
    }

    const filter: Record<string, unknown> =
      conditions.length === 1 ? conditions[0] : { $and: conditions };

    const [items, total] = await Promise.all([
      this.auditLogModel
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.auditLogModel.countDocuments(filter).exec(),
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

  /** Batch-denormalize actor display names for entries written before actorName was captured. */
  private async mapMany(
    items: AuditLogDocument[],
  ): Promise<AuditLogResponseDto[]> {
    if (items.length === 0) return [];

    const missingNameIds = [
      ...new Set(
        items
          .filter(
            (i) =>
              !i.actorName && i.actorId && !i.actorId.startsWith('system:'),
          )
          .map((i) => i.actorId!),
      ),
    ];
    const staff =
      await this.usersService.findStaffByKeycloakIds(missingNameIds);
    const staffNames = new Map(
      staff.map((u) => [
        u.keycloakId,
        `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email,
      ]),
    );

    return items.map((i) => toAuditLogResponseDto(i, staffNames));
  }
}

/**
 * Compare a whitelist of top-level fields between two plain snapshots
 * (e.g. `doc.toObject()` before/after a mutation) and return only the
 * fields that actually differ.
 */
export function diffFields(
  before: object,
  after: object,
  fields: string[],
): AuditFieldChange[] {
  const b = before as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  const changes: AuditFieldChange[] = [];
  for (const field of fields) {
    const from = normalize(b[field]);
    const to = normalize(a[field]);
    if (JSON.stringify(from) !== JSON.stringify(to)) {
      changes.push({ field, from, to });
    }
  }
  return changes;
}

function normalize(value: unknown): unknown {
  if (value instanceof Types.ObjectId) return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value === undefined) return null;
  return value;
}

/** Shallow-clone a document snapshot without its heavy sub-array fields (interactions, comments, history, …). */
export function omitFields(
  record: object,
  keys: string[],
): Record<string, unknown> {
  const clone = { ...record } as Record<string, unknown>;
  for (const key of keys) delete clone[key];
  return clone;
}

/** Build an actor snapshot straight from the JWT — no extra DB round-trip. */
export function actorFromJwt(user: KeycloakJwtPayload): AuditActor {
  const name = `${user.given_name ?? ''} ${user.family_name ?? ''}`.trim();
  return {
    id: user.sub,
    name: name || user.preferred_username || user.email,
    email: user.email,
  };
}
