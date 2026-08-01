/**
 * Seed bookkeeping.
 *
 * The seeder never wipes collections. Instead it records the exact `_id`s it
 * inserted (and the Keycloak users it provisioned) in a `seed_manifest`
 * document, so `--fresh` can remove precisely its own data and leave real
 * users, the organization and the subscription untouched.
 */
import { Connection, Types } from 'mongoose';

const MANIFEST_COLLECTION = 'seed_manifest';
const MANIFEST_ID = 'seed';

interface ManifestDoc {
  _id: string;
  seededAt: Date;
  /** collection name → inserted document ids */
  collections: Record<string, Types.ObjectId[]>;
  /** Keycloak user ids created by the seeder (staff + portal customers) */
  keycloakIds: string[];
  /** Counter documents to reset rather than delete. */
  counters: string[];
}

export class SeedManifest {
  private readonly collections = new Map<string, Types.ObjectId[]>();
  private readonly keycloakIds: string[] = [];
  private readonly counters: string[] = [];

  constructor(private readonly conn: Connection) {}

  /** Records ids inserted into `collection`. */
  track(collection: string, ids: Types.ObjectId[]): void {
    const existing = this.collections.get(collection) ?? [];
    existing.push(...ids);
    this.collections.set(collection, existing);
  }

  trackKeycloak(...ids: string[]): void {
    this.keycloakIds.push(...ids);
  }

  trackCounter(id: string): void {
    this.counters.push(id);
  }

  get keycloakCount(): number {
    return this.keycloakIds.length;
  }

  /**
   * Persists the manifest. Called after every step (not just at the end) so
   * a run that dies halfway is still fully reversible with `--fresh`.
   */
  async flush(): Promise<void> {
    const doc: ManifestDoc = {
      _id: MANIFEST_ID,
      seededAt: new Date(),
      collections: Object.fromEntries(this.collections),
      keycloakIds: this.keycloakIds,
      counters: this.counters,
    };
    await this.conn
      .collection(MANIFEST_COLLECTION)
      .replaceOne({ _id: MANIFEST_ID as never }, doc, {
        upsert: true,
      });
  }

  static async read(conn: Connection): Promise<ManifestDoc | null> {
    return (await conn
      .collection(MANIFEST_COLLECTION)
      .findOne({ _id: MANIFEST_ID as never })) as ManifestDoc | null;
  }
}

export interface ResetSummary {
  documents: number;
  keycloakUsers: number;
  perCollection: Record<string, number>;
}

/**
 * Deletes everything a previous run created. `deleteKeycloakUser` is passed
 * in rather than imported so a Keycloak outage can be tolerated (failures are
 * counted, not thrown — the Mongo side still gets cleaned).
 */
export async function resetSeedData(
  conn: Connection,
  deleteKeycloakUser: (id: string) => Promise<void>,
): Promise<ResetSummary> {
  const manifest = await SeedManifest.read(conn);
  const summary: ResetSummary = {
    documents: 0,
    keycloakUsers: 0,
    perCollection: {},
  };
  if (!manifest) return summary;

  for (const [collection, ids] of Object.entries(manifest.collections ?? {})) {
    if (!ids?.length) continue;
    const objectIds = ids.map((id) => new Types.ObjectId(id));
    const res = await conn
      .collection(collection)
      .deleteMany({ _id: { $in: objectIds } });
    summary.perCollection[collection] = res.deletedCount;
    summary.documents += res.deletedCount;
  }

  // Counters are deliberately NOT rolled back. Ticket numbers are monotonic
  // and human-visible; rewinding the sequence would let a ticket created
  // after the seed reuse a number that already appeared in someone's inbox.

  for (const keycloakId of manifest.keycloakIds ?? []) {
    try {
      await deleteKeycloakUser(keycloakId);
      summary.keycloakUsers += 1;
    } catch {
      // Already gone, or Keycloak is down — not worth failing the reset over.
    }
  }

  await conn
    .collection(MANIFEST_COLLECTION)
    .deleteOne({ _id: MANIFEST_ID as never });
  return summary;
}
