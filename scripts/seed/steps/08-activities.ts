/**
 * Step 08 — tasks, calls, meetings and logged communications.
 *
 * Three populations, because a CRM that only contains completed work has an
 * empty task list and an empty reminders feed:
 *
 *   ~55%  completed, in the past
 *   ~12%  pending and overdue  (dueAt < now — the "needs attention" bucket)
 *   ~25%  pending and upcoming (dueAt > now — the calendar / reminders feed)
 *    ~8%  cancelled
 *
 * `syncedToRecord` is only true for completed communications attached to a
 * lead or contact, mirroring `ActivitiesService.syncCompletedCommunication`:
 * those are exactly the ones whose content was already folded into the
 * record's own engagement/interaction history in steps 02 and 03.
 */
import { Types } from 'mongoose';
import {
  Activity,
  ActivityDocument,
  COMMUNICATION_TYPES,
  type ActivityStatus,
  type ActivityType,
  type RelatedType,
} from '../../../src/activities/activity.schema';
import { VOLUMES } from '../config';
import { model, SeedContext, StaffRef } from '../context';
import {
  addHours,
  addMinutes,
  between,
  chance,
  distribute,
  futureMoment,
  historyMoment,
  int,
  NOW,
  pick,
  weighted,
} from '../rng';

const TYPE_MIX = [
  { value: 'task' as ActivityType, weight: 30 },
  { value: 'call' as ActivityType, weight: 22 },
  { value: 'email' as ActivityType, weight: 24 },
  { value: 'meeting' as ActivityType, weight: 14 },
  { value: 'note' as ActivityType, weight: 7 },
  { value: 'sms' as ActivityType, weight: 3 },
];

const PRIORITY_MIX = [
  { value: 'low', weight: 20 },
  { value: 'normal', weight: 58 },
  { value: 'high', weight: 22 },
];

/** Lifecycle buckets, expanded to exact counts by `distribute`. */
const LIFECYCLE_MIX = [
  { value: 'completed' as const, weight: 55 },
  { value: 'overdue' as const, weight: 12 },
  { value: 'upcoming' as const, weight: 25 },
  { value: 'cancelled' as const, weight: 8 },
];

const SUBJECTS: Record<ActivityType, string[]> = {
  task: [
    'Send the updated proposal',
    'Prepare the QBR deck',
    'Chase the signed order form',
    'Update the account plan',
    'Confirm the renewal date with finance',
    'Research the competitor mentioned on the call',
    'Set up the trial environment',
    'Follow up on the security questionnaire',
  ],
  call: [
    'Discovery call',
    'Follow-up call',
    'Renewal conversation',
    'Check-in call',
    'Technical qualification call',
    'Handover call with customer success',
  ],
  email: [
    'Sent pricing breakdown',
    'Shared the implementation timeline',
    'Introduction to the support team',
    'Contract sent for signature',
    'Re: outstanding questions',
    'Quarterly product update',
  ],
  meeting: [
    'Product demo',
    'Technical deep-dive',
    'Kick-off workshop',
    'Quarterly business review',
    'Contract negotiation',
    'Onboarding session',
  ],
  note: [
    'Notes from the trade show',
    'Internal handover notes',
    'Competitor intelligence',
    'Budget cycle information',
  ],
  sms: [
    'Meeting reminder sent',
    'Confirmed availability',
    'Quick status update',
  ],
};

const DESCRIPTIONS = [
  'Walked through the reporting module and answered questions on permissions.',
  'They want a phased rollout: sales first, then support in the following quarter.',
  'Budget sign-off sits with the CFO; our champion is preparing the business case.',
  'Agreed to reconvene once the security review is complete.',
  'Shared two reference customers in the same industry.',
  'No answer — left a voicemail and followed up by email.',
  'Confirmed the migration scope: roughly 12k contacts and 3 years of history.',
  'Discussed pricing tiers; they are leaning towards the annual plan.',
];

/** Meeting/call durations that look like real calendar entries. */
const DURATIONS = [15, 30, 30, 45, 60, 60, 90];

interface RelatedTarget {
  relatedType: RelatedType;
  relatedId: Types.ObjectId;
  owner: string;
  teamId: Types.ObjectId;
  /** Nothing may be logged against a record before it existed. */
  notBefore: Date;
}

export async function seedActivities(ctx: SeedContext): Promise<void> {
  const activityModel = model<ActivityDocument>(ctx.app, Activity.name);
  const staffByKeycloakId = new Map<string, StaffRef>(
    ctx.pools.staff.map((s) => [s.keycloakId, s]),
  );

  /** Builds the pool of records an activity can be attached to. */
  const targets: RelatedTarget[] = [
    ...ctx.pools.leads.map(
      (l): RelatedTarget => ({
        relatedType: 'lead',
        relatedId: l.id,
        owner: l.ownerId,
        teamId: l.teamId,
        notBefore: l.createdAt,
      }),
    ),
    ...ctx.pools.contacts.map(
      (c): RelatedTarget => ({
        relatedType: 'contact',
        relatedId: c.id,
        owner: c.ownerId,
        teamId: c.teamId,
        notBefore: c.createdAt,
      }),
    ),
    ...ctx.pools.customers.map(
      (c): RelatedTarget => ({
        relatedType: 'customer',
        relatedId: c.id,
        owner: c.ownerId,
        teamId: c.teamId,
        notBefore: c.createdAt,
      }),
    ),
    ...ctx.pools.accounts.map(
      (a): RelatedTarget => ({
        relatedType: 'account',
        relatedId: a.id,
        owner: a.ownerId,
        teamId: a.teamId,
        notBefore: a.createdAt,
      }),
    ),
    ...ctx.pools.opportunities.map(
      (o): RelatedTarget => ({
        relatedType: 'opportunity',
        relatedId: o.id,
        owner: o.ownerId,
        teamId: o.teamId,
        notBefore: o.createdAt,
      }),
    ),
    ...ctx.pools.tickets
      .filter((t) => t.ownerId)
      .map((t): RelatedTarget => {
        const owner = staffByKeycloakId.get(t.ownerId!);
        return {
          relatedType: 'ticket',
          relatedId: t.id,
          owner: t.ownerId!,
          teamId: owner?.teamId ?? ctx.pools.teams[0].id,
          notBefore: t.createdAt,
        };
      }),
  ];

  if (!targets.length) return;

  const lifecycles = distribute(LIFECYCLE_MIX, VOLUMES.activities);
  const docs: Record<string, unknown>[] = [];

  for (let i = 0; i < VOLUMES.activities; i++) {
    const lifecycle = lifecycles[i];
    const type = weighted(TYPE_MIX);
    const isCommunication = COMMUNICATION_TYPES.includes(type);

    // ~12% of activities are unattached internal to-dos, as in real usage.
    const target = chance(0.88) ? pick(targets) : undefined;
    const owner = target
      ? (staffByKeycloakId.get(target.owner) ?? pick(ctx.pools.staff))
      : pick(ctx.pools.staff);

    const status: ActivityStatus =
      lifecycle === 'completed'
        ? 'completed'
        : lifecycle === 'cancelled'
          ? 'cancelled'
          : 'pending';

    // Past work is anchored after the related record was created; future work
    // is anchored from today forward.
    const isFuture = lifecycle === 'upcoming';
    const anchor = isFuture
      ? futureMoment(1, 60)
      : target
        ? between(target.notBefore, addHours(NOW, -1))
        : historyMoment();

    const doc: Record<string, unknown> = {
      _id: new Types.ObjectId(),
      organizationId: ctx.organizationId,
      type,
      subject: pick(SUBJECTS[type]),
      description: chance(0.55) ? pick(DESCRIPTIONS) : undefined,
      status,
      priority: weighted(PRIORITY_MIX),
      // Only communications have a direction; tasks and notes don't.
      direction:
        isCommunication && type !== 'note'
          ? pick(['inbound', 'outbound'])
          : undefined,
      relatedType: target?.relatedType,
      relatedId: target?.relatedId,
      // Completed comms on a lead/contact are exactly the ones whose content
      // was folded into that record's history in steps 02/03.
      syncedToRecord:
        status === 'completed' &&
        isCommunication &&
        (target?.relatedType === 'lead' || target?.relatedType === 'contact'),
      createdBy: owner.keycloakId,
      assignedToId: owner.keycloakId,
      assignedTeamId: owner.teamId,
      createdAt: isFuture ? between(addHours(NOW, -720), NOW) : anchor,
    };

    // Scheduling fields differ by type: meetings and calls occupy a slot on
    // the calendar, everything else just has a deadline.
    if (type === 'meeting' || type === 'call') {
      doc.startAt = anchor;
      doc.endAt = addMinutes(anchor, pick(DURATIONS));
    }

    if (lifecycle === 'overdue') {
      // Overdue: due in the past, still pending. This is the bucket the
      // "needs attention" view and the SLA sweep are meant to surface.
      doc.dueAt = between(addHours(NOW, -1440), addHours(NOW, -1));
      doc.remindAt = addHours(doc.dueAt as Date, -24);
    } else if (isFuture) {
      doc.dueAt = anchor;
      doc.remindAt = addHours(anchor, -int(1, 48));
    } else {
      doc.dueAt = anchor;
      if (chance(0.4)) doc.remindAt = addHours(anchor, -int(1, 24));
    }

    if (status === 'completed') {
      const completedAt = addHours(anchor, int(0, 48));
      doc.completedAt = completedAt >= NOW ? anchor : completedAt;
      doc.updatedAt = doc.completedAt;
    } else {
      doc.updatedAt = doc.createdAt;
    }

    docs.push(doc);
  }

  await ctx.insert('activities', activityModel, docs);

  const counts = docs.reduce<Record<string, number>>((acc, d) => {
    const key = String(d.status);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  ctx.logger.log(
    `  ${docs.length} activities — ` +
      Object.entries(counts)
        .map(([k, v]) => `${v} ${k}`)
        .join(', '),
  );
}
