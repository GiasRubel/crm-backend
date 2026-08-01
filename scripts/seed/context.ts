/**
 * Shared state threaded through every seed step: the Mongo handles, the
 * organization being filled, the manifest, and the id pools each step
 * publishes for later steps to reference.
 */
import { INestApplicationContext, Logger } from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { SeedManifest } from './manifest';
import { AppRole } from '../../src/users/app-role.enum';
import type { AccountSize } from '../../src/accounts/account.schema';
import type { RegionKey } from './config';

/** A staff member available as a record owner. */
export interface StaffRef {
  keycloakId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: AppRole;
  teamId: Types.ObjectId;
  teamKind: TeamKind;
  region: RegionKey;
}

export type TeamKind = 'sales' | 'support' | 'success';

export interface TeamRef {
  id: Types.ObjectId;
  name: string;
  kind: TeamKind;
  region: RegionKey;
  memberIds: string[];
}

export interface AccountRef {
  id: Types.ObjectId;
  name: string;
  size: AccountSize;
  region: RegionKey;
  ownerId: string;
  teamId: Types.ObjectId;
  createdAt: Date;
}

export interface ContactRef {
  id: Types.ObjectId;
  firstName: string;
  lastName: string;
  email: string;
  accountId: Types.ObjectId;
  ownerId: string;
  teamId: Types.ObjectId;
  createdAt: Date;
}

export interface CustomerRef {
  id: Types.ObjectId;
  keycloakId: string;
  firstName: string;
  lastName: string;
  email: string;
  accountId?: Types.ObjectId;
  ownerId: string;
  teamId: Types.ObjectId;
  createdAt: Date;
}

export interface LeadRef {
  id: Types.ObjectId;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  ownerId: string;
  teamId: Types.ObjectId;
  createdAt: Date;
}

export interface OpportunityRef {
  id: Types.ObjectId;
  name: string;
  stage: string;
  amount: number;
  ownerId: string;
  teamId: Types.ObjectId;
  createdAt: Date;
}

export interface TicketRef {
  id: Types.ObjectId;
  number: string;
  subject: string;
  status: string;
  ownerId?: string;
  createdAt: Date;
}

export interface KbArticleRef {
  id: Types.ObjectId;
  title: string;
  status: string;
  visibility: string;
}

/** Every pool later steps can draw from. Populated in step order. */
export interface SeedPools {
  teams: TeamRef[];
  staff: StaffRef[];
  accounts: AccountRef[];
  contacts: ContactRef[];
  customers: CustomerRef[];
  leads: LeadRef[];
  opportunities: OpportunityRef[];
  tickets: TicketRef[];
  kbArticles: KbArticleRef[];
}

export interface SeedContext {
  app: INestApplicationContext;
  conn: Connection;
  organizationId: Types.ObjectId;
  manifest: SeedManifest;
  pools: SeedPools;
  logger: Logger;
  /**
   * Bulk-inserts with `timestamps: false` so the backdated createdAt/updatedAt
   * on each document survive, and records the ids in the manifest.
   */
  insert<T>(
    collection: string,
    model: Model<T>,
    docs: unknown[],
  ): Promise<void>;
}

/** Staff members on sales-side teams — the owner pool for pipeline records. */
export function salesStaff(ctx: SeedContext): StaffRef[] {
  return ctx.pools.staff.filter((s) => s.teamKind !== 'support');
}

/** Staff members on support teams — the owner pool for tickets. */
export function supportStaff(ctx: SeedContext): StaffRef[] {
  return ctx.pools.staff.filter((s) => s.teamKind === 'support');
}

export function adminStaff(ctx: SeedContext): StaffRef[] {
  return ctx.pools.staff.filter(
    (s) => s.role === AppRole.Admin || s.role === AppRole.Administrator,
  );
}

export function buildContext(
  app: INestApplicationContext,
  organizationId: Types.ObjectId,
): SeedContext {
  const conn = app.get<Connection>(getConnectionToken());
  const manifest = new SeedManifest(conn);
  const logger = new Logger('seed');

  return {
    app,
    conn,
    organizationId,
    manifest,
    logger,
    pools: {
      teams: [],
      staff: [],
      accounts: [],
      contacts: [],
      customers: [],
      leads: [],
      opportunities: [],
      tickets: [],
      kbArticles: [],
    },
    async insert(collection, model, docs) {
      if (!docs.length) return;
      // Chunked: a single 6 000-document insertMany can exceed the 16 MB
      // command limit once activities carry descriptions.
      const CHUNK = 500;
      for (let i = 0; i < docs.length; i += CHUNK) {
        await model.insertMany(docs.slice(i, i + CHUNK) as never, {
          timestamps: false,
        });
      }
      manifest.track(
        collection,
        docs.map((d) => (d as { _id: Types.ObjectId })._id),
      );
      await manifest.flush();
    },
  };
}

/** Typed model lookup by schema class name. */
export function model<T>(app: INestApplicationContext, name: string): Model<T> {
  return app.get<Model<T>>(getModelToken(name));
}
