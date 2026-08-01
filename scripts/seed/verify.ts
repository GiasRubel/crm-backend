/**
 * Post-seed integrity pass.
 *
 * The seeder writes through raw models, which means none of the service-level
 * invariants are enforced for it. This file is the compensating control: it
 * re-checks, against the database, every rule the generators were supposed to
 * uphold. A seed that passes here is one the dashboards, pipeline board, SLA
 * views and report builder can all be trusted to render sensibly.
 *
 * Runs automatically at the end of `yarn seed`; also available standalone via
 * `yarn seed:verify`.
 */
import { STAGE_PROBABILITY } from '../../src/opportunities/opportunity.schema';
import { SeedContext } from './context';

/**
 * "Field is present and non-null", for use inside `$expr`.
 *
 * `{ $ne: ['$field', null] }` does NOT mean this: inside an aggregation
 * expression a missing field resolves to `missing`, which compares *unequal*
 * to null, so every document lacking the field matches. `$gt: ['$field', null]`
 * is the correct idiom — null and missing both sort below every real value.
 */
const present = (field: string) => ({ $gt: [`$${field}`, null] });

interface Check {
  label: string;
  /** Number of violating documents. 0 = pass. */
  count: number;
  /** A sample offender, for debugging. */
  sample?: unknown;
}

export async function verifySeed(ctx: SeedContext): Promise<void> {
  const db = ctx.conn;
  const checks: Check[] = [];

  const add = async (
    label: string,
    collection: string,
    filter: Record<string, unknown>,
  ): Promise<void> => {
    const count = await db.collection(collection).countDocuments(filter);
    const sample =
      count > 0
        ? await db
            .collection(collection)
            .findOne(filter, { projection: { _id: 1 } })
        : undefined;
    checks.push({ label, count, sample });
  };

  // ── Tenancy ─────────────────────────────────────────────────────────────
  const TENANT_COLLECTIONS = [
    'accounts',
    'contacts',
    'customers',
    'leads',
    'opportunities',
    'activities',
    'tickets',
    'kbarticles',
    'automationrules',
    'automationruns',
    'savedreports',
    'teams',
  ];
  for (const collection of TENANT_COLLECTIONS) {
    await add(
      `${collection}: every document carries organizationId`,
      collection,
      { organizationId: { $ne: ctx.organizationId } },
    );
  }

  // ── Pipeline ────────────────────────────────────────────────────────────
  // probability must be the derived value for the stage, never a free number.
  for (const [stage, probability] of Object.entries(STAGE_PROBABILITY)) {
    await add(
      `opportunities: probability matches stage "${stage}"`,
      'opportunities',
      { stage, probability: { $ne: probability } },
    );
  }
  await add('opportunities: closed deals have closedAt', 'opportunities', {
    stage: { $in: ['closed_won', 'closed_lost'] },
    closedAt: { $exists: false },
  });
  await add('opportunities: open deals have no closedAt', 'opportunities', {
    stage: { $in: ['discovery', 'proposal', 'negotiation'] },
    closedAt: { $exists: true, $ne: null },
  });
  await add(
    'opportunities: every closed_lost deal has a lostReason',
    'opportunities',
    {
      stage: 'closed_lost',
      $or: [{ lostReason: { $exists: false } }, { lostReason: '' }],
    },
  );
  await add(
    'opportunities: stageHistory ends at the current stage',
    'opportunities',
    {
      $expr: {
        $and: [
          { $gt: [{ $size: '$stageHistory' }, 0] },
          { $ne: [{ $last: '$stageHistory.to' }, '$stage'] },
        ],
      },
    },
  );

  // ── Leads ───────────────────────────────────────────────────────────────
  // score must equal the clamped sum of its own engagement points.
  await add('leads: score equals the sum of engagement points', 'leads', {
    $expr: {
      $ne: [
        '$score',
        {
          $min: [100, { $max: [0, { $sum: '$engagements.points' }] }],
        },
      ],
    },
  });
  await add('leads: score stays within 0–100', 'leads', {
    $or: [{ score: { $lt: 0 } }, { score: { $gt: 100 } }],
  });
  await add(
    'leads: converted leads carry a customer and an opportunity',
    'leads',
    {
      status: 'converted',
      $or: [
        { convertedCustomerId: { $exists: false } },
        { convertedOpportunityId: { $exists: false } },
        { convertedAt: { $exists: false } },
      ],
    },
  );
  await add('leads: non-converted leads carry no conversion fields', 'leads', {
    status: { $ne: 'converted' },
    $or: [
      { convertedCustomerId: { $exists: true, $ne: null } },
      { convertedOpportunityId: { $exists: true, $ne: null } },
    ],
  });

  // ── Tickets ─────────────────────────────────────────────────────────────
  await add('tickets: firstResponseAt is never before createdAt', 'tickets', {
    $expr: {
      $and: [
        present('firstResponseAt'),
        { $lt: ['$firstResponseAt', '$createdAt'] },
      ],
    },
  });
  await add('tickets: resolvedAt is never before firstResponseAt', 'tickets', {
    $expr: {
      $and: [
        present('resolvedAt'),
        present('firstResponseAt'),
        { $lt: ['$resolvedAt', '$firstResponseAt'] },
      ],
    },
  });
  await add('tickets: closedAt is never before resolvedAt', 'tickets', {
    $expr: {
      $and: [
        present('closedAt'),
        present('resolvedAt'),
        { $lt: ['$closedAt', '$resolvedAt'] },
      ],
    },
  });
  await add('tickets: unresolved tickets have no resolvedAt', 'tickets', {
    status: { $in: ['open', 'in_progress', 'waiting_on_customer'] },
    resolvedAt: { $exists: true, $ne: null },
  });
  await add('tickets: resolved/closed tickets have a resolvedAt', 'tickets', {
    status: { $in: ['resolved', 'closed'] },
    $or: [{ resolvedAt: { $exists: false } }, { resolvedAt: null }],
  });

  // ── Activities ──────────────────────────────────────────────────────────
  await add('activities: meetings/calls end after they start', 'activities', {
    $expr: {
      $and: [
        present('endAt'),
        present('startAt'),
        { $lte: ['$endAt', '$startAt'] },
      ],
    },
  });
  await add('activities: completed activities have completedAt', 'activities', {
    status: 'completed',
    $or: [{ completedAt: { $exists: false } }, { completedAt: null }],
  });
  await add(
    'activities: pending activities have no completedAt',
    'activities',
    {
      status: 'pending',
      completedAt: { $exists: true, $ne: null },
    },
  );
  await add(
    'activities: syncedToRecord only on completed lead/contact comms',
    'activities',
    {
      syncedToRecord: true,
      $or: [
        { status: { $ne: 'completed' } },
        { relatedType: { $nin: ['lead', 'contact'] } },
        { type: 'task' },
      ],
    },
  );
  await add(
    'activities: a relatedId always comes with a relatedType',
    'activities',
    {
      relatedId: { $exists: true, $ne: null },
      relatedType: { $exists: false },
    },
  );

  // ── Contacts / accounts ─────────────────────────────────────────────────
  await add('contacts: doNotContact overrides every opt-in', 'contacts', {
    doNotContact: true,
    $or: [{ emailOptIn: true }, { phoneOptIn: true }, { smsOptIn: true }],
  });

  // ── Automation ──────────────────────────────────────────────────────────
  await add('automationrules: runCount is never negative', 'automationrules', {
    runCount: { $lt: 0 },
  });

  // ── Referential integrity + cross-collection rules ──────────────────────
  checks.push(...(await referentialChecks(ctx)));
  checks.push(...(await crossCollectionChecks(ctx)));

  report(ctx, checks);
}

/** Dangling foreign keys — the fastest way to make a detail page 404. */
async function referentialChecks(ctx: SeedContext): Promise<Check[]> {
  const db = ctx.conn;
  const out: Check[] = [];

  const dangling = async (
    label: string,
    from: string,
    field: string,
    to: string,
  ): Promise<void> => {
    const rows = await db
      .collection(from)
      .aggregate([
        { $match: { [field]: { $exists: true, $ne: null } } },
        {
          $lookup: {
            from: to,
            localField: field,
            foreignField: '_id',
            as: 'target',
          },
        },
        { $match: { target: { $size: 0 } } },
        { $limit: 5 },
        { $project: { _id: 1, [field]: 1 } },
      ])
      .toArray();
    out.push({ label, count: rows.length, sample: rows[0] });
  };

  await dangling(
    'contacts.accountId resolves',
    'contacts',
    'accountId',
    'accounts',
  );
  await dangling(
    'contacts.customerId resolves',
    'contacts',
    'customerId',
    'customers',
  );
  await dangling(
    'opportunities.customerId resolves',
    'opportunities',
    'customerId',
    'customers',
  );
  await dangling(
    'opportunities.accountId resolves',
    'opportunities',
    'accountId',
    'accounts',
  );
  await dangling(
    'opportunities.leadId resolves',
    'opportunities',
    'leadId',
    'leads',
  );
  await dangling(
    'tickets.customerId resolves',
    'tickets',
    'customerId',
    'customers',
  );
  await dangling(
    'leads.convertedCustomerId resolves',
    'leads',
    'convertedCustomerId',
    'customers',
  );
  await dangling(
    'leads.convertedOpportunityId resolves',
    'leads',
    'convertedOpportunityId',
    'opportunities',
  );
  await dangling(
    'automationruns.ruleId resolves',
    'automationruns',
    'ruleId',
    'automationrules',
  );

  return out;
}

/**
 * Rules that span two collections and can't be expressed as a single filter:
 * ownership/team consistency, one-primary-per-account, and the activity
 * polymorphic link.
 */
async function crossCollectionChecks(ctx: SeedContext): Promise<Check[]> {
  const db = ctx.conn;
  const out: Check[] = [];

  // Every assignedToId must be a real staff keycloakId, and its
  // assignedTeamId must be a team that person actually belongs to.
  const teams = await db
    .collection('teams')
    .find({}, { projection: { _id: 1, memberIds: 1 } })
    .toArray();
  const membership = new Map<string, Set<string>>(
    teams.map((t) => [
      String(t._id),
      new Set<string>((t.memberIds as string[]) ?? []),
    ]),
  );

  for (const collection of [
    'accounts',
    'contacts',
    'customers',
    'leads',
    'opportunities',
    'activities',
    'tickets',
  ]) {
    const rows = await db
      .collection(collection)
      .find(
        { assignedTeamId: { $exists: true, $ne: null } },
        { projection: { assignedToId: 1, assignedTeamId: 1 } },
      )
      .toArray();
    const offenders = rows.filter((row) => {
      const members = membership.get(String(row.assignedTeamId));
      return !members || !members.has(String(row.assignedToId));
    });
    out.push({
      label: `${collection}: owner is a member of the routed team`,
      count: offenders.length,
      sample: offenders[0],
    });
  }

  // At most one primary contact per account.
  const multiPrimary = await db
    .collection('contacts')
    .aggregate([
      { $match: { isPrimary: true, accountId: { $ne: null } } },
      { $group: { _id: '$accountId', n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
      { $limit: 5 },
    ])
    .toArray();
  out.push({
    label: 'contacts: at most one primary contact per account',
    count: multiPrimary.length,
    sample: multiPrimary[0],
  });

  // Activity polymorphic links must point at a document that exists.
  const RELATED_COLLECTIONS: Record<string, string> = {
    lead: 'leads',
    contact: 'contacts',
    customer: 'customers',
    account: 'accounts',
    opportunity: 'opportunities',
    ticket: 'tickets',
  };
  let danglingActivities = 0;
  let danglingSample: unknown;
  for (const [relatedType, collection] of Object.entries(RELATED_COLLECTIONS)) {
    const rows = await db
      .collection('activities')
      .aggregate([
        { $match: { relatedType } },
        {
          $lookup: {
            from: collection,
            localField: 'relatedId',
            foreignField: '_id',
            as: 'target',
          },
        },
        { $match: { target: { $size: 0 } } },
        { $limit: 5 },
        { $project: { _id: 1, relatedType: 1, relatedId: 1 } },
      ])
      .toArray();
    danglingActivities += rows.length;
    danglingSample ??= rows[0];
  }
  out.push({
    label: 'activities: relatedId resolves for every relatedType',
    count: danglingActivities,
    sample: danglingSample,
  });

  // Ticket numbers are human-visible and uniquely indexed.
  const dupeNumbers = await db
    .collection('tickets')
    .aggregate([
      { $group: { _id: '$number', n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
      { $limit: 5 },
    ])
    .toArray();
  out.push({
    label: 'tickets: ticket numbers are unique',
    count: dupeNumbers.length,
    sample: dupeNumbers[0],
  });

  // Every converted lead maps to exactly one opportunity.
  const conversionMismatch = await db
    .collection('leads')
    .aggregate([
      { $match: { status: 'converted' } },
      {
        $lookup: {
          from: 'opportunities',
          localField: '_id',
          foreignField: 'leadId',
          as: 'deals',
        },
      },
      { $match: { $expr: { $ne: [{ $size: '$deals' }, 1] } } },
      { $limit: 5 },
      { $project: { _id: 1, email: 1 } },
    ])
    .toArray();
  out.push({
    label: 'leads: each converted lead maps to exactly one opportunity',
    count: conversionMismatch.length,
    sample: conversionMismatch[0],
  });

  // automationrules.runCount must equal the runs actually logged.
  const runCounts = await db
    .collection('automationruns')
    .aggregate([{ $group: { _id: '$ruleId', n: { $sum: 1 } } }])
    .toArray();
  const actual = new Map(runCounts.map((r) => [String(r._id), r.n as number]));
  const rules = await db
    .collection('automationrules')
    .find({}, { projection: { runCount: 1, name: 1 } })
    .toArray();
  const runMismatch = rules.filter(
    (r) => (actual.get(String(r._id)) ?? 0) !== (r.runCount as number),
  );
  out.push({
    label: 'automationrules: runCount matches the logged runs',
    count: runMismatch.length,
    sample: runMismatch[0],
  });

  return out;
}

function report(ctx: SeedContext, checks: Check[]): void {
  const failures = checks.filter((c) => c.count > 0);

  console.log('\n  Integrity');
  console.log('  ' + '─'.repeat(72));
  for (const check of checks) {
    const mark = check.count === 0 ? 'ok  ' : 'FAIL';
    const detail = check.count === 0 ? '' : `  (${check.count} violations)`;
    console.log(`  ${mark}  ${check.label}${detail}`);
  }

  if (!failures.length) {
    console.log(`\n  All ${checks.length} checks passed.\n`);
    return;
  }

  console.log(`\n  ${failures.length} of ${checks.length} checks FAILED:`);
  for (const failure of failures) {
    console.log(
      `   - ${failure.label}: ${failure.count}` +
        (failure.sample ? ` e.g. ${JSON.stringify(failure.sample)}` : ''),
    );
  }
  console.log('');
  ctx.logger.error('Seed data failed integrity verification (see above).');
  process.exitCode = 1;
}
