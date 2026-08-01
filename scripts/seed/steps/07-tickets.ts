/**
 * Step 07 — the helpdesk.
 *
 * SLA reporting only works if the response timestamps tell a consistent
 * story, so each ticket's thread is generated first and the timestamps are
 * derived from it:
 *
 *   createdAt ≤ firstResponseAt ≤ resolvedAt ≤ closedAt
 *
 * and a field is only set once the ticket has actually reached that state —
 * an `open` ticket has no `resolvedAt`, and a ticket with no public staff
 * reply yet has no `firstResponseAt` (those are the SLA breaches).
 */
import { Types } from 'mongoose';
import {
  Ticket,
  TicketCounter,
  TicketCounterDocument,
  TicketDocument,
  type TicketStatus,
  type TicketType,
} from '../../../src/tickets/ticket.schema';
import {
  TICKET_PRIORITY_MIX,
  TICKET_STATUS_MIX,
  TICKET_TYPE_MIX,
  VOLUMES,
} from '../config';
import { model, SeedContext, supportStaff, TicketRef } from '../context';
import {
  addHours,
  between,
  chance,
  distribute,
  int,
  momentAfter,
  NOW,
  pick,
  sample,
} from '../rng';

const COUNTER_ID = 'ticket';
const COUNTER_START = 1000;

const SUBJECTS: Record<TicketType, string[]> = {
  question: [
    'How do I add a second user to my account?',
    'Can I export my contacts to CSV?',
    'What is included in the annual plan?',
    'Does the CRM support custom fields?',
    'How long is data retained after cancellation?',
    'Is there a mobile app?',
  ],
  problem: [
    'Cannot log in after password reset',
    'Report shows no data for last month',
    'Contacts list is missing records',
    'Email notifications stopped arriving',
    'Deal stuck in the proposal stage',
    'Calendar export produces an empty file',
  ],
  bug: [
    'Pagination skips the last page of results',
    'Sorting by close date reverses randomly',
    'Duplicate lead created on double submit',
    'Currency displays with the wrong separator',
    'Ticket counter skipped a number',
    'Timezone off by one hour on activity times',
  ],
  feature_request: [
    'Please add bulk reassignment of records',
    'Would like Slack notifications for new tickets',
    'Request: custom pipeline stages',
    'Add a dark mode to the dashboard',
    'Support for multiple currencies',
  ],
  billing: [
    'Invoice has the wrong VAT number',
    'Charged twice this month',
    'Need a purchase order number on the invoice',
    'Request a refund for the unused period',
    'Update the card on file',
  ],
  other: [
    'Partnership enquiry',
    'Request for a reference call',
    'Security questionnaire for procurement',
  ],
};

const CUSTOMER_OPENERS = [
  'Hi — we ran into this today and it is blocking the team. Could you take a look?',
  'This started happening after the last update. Nothing else changed on our side.',
  'Apologies if this is documented somewhere, I could not find it in the help centre.',
  'We need this resolved before the end of the week if at all possible.',
  'Happy to jump on a call if that is easier than going back and forth over email.',
];

const STAFF_REPLIES = [
  'Thanks for reporting this — I can reproduce it on our side and have raised it with the team.',
  'I have checked your account and the setting was disabled. I have switched it back on for you.',
  'Could you confirm which browser and version you are using? That will help narrow it down.',
  'This is expected behaviour, but I agree it is confusing. I have linked an article that explains it.',
  'A fix is going out in the next release. I will update this ticket once it is live.',
  'I have issued the correction on the invoice — you should see it within one business day.',
];

const CUSTOMER_FOLLOWUPS = [
  'That worked, thank you.',
  'Still seeing the same thing after clearing the cache.',
  'Confirmed on Chrome 141, Windows 11.',
  'Any update on this one?',
  'Perfect — please close the ticket.',
];

const INTERNAL_NOTES = [
  'Escalating to tier 2 — looks like the same root cause as last week.',
  'Customer is on the enterprise plan, treat as priority.',
  'Reproduced locally; opening an engineering issue.',
  'Waiting on billing to confirm before replying.',
  'Third report of this today — likely a regression.',
];

const RESOLUTIONS = [
  'Resolved: the setting has been corrected and the customer confirmed.',
  'Resolved: shipped in release 4.2, verified with the customer.',
  'Resolved: user error, walked them through the correct steps.',
  'Resolved: credit note issued and applied to the next invoice.',
  'Closing as duplicate of an earlier ticket from the same account.',
];

/** Has the ticket reached the point where this timestamp exists? */
const IS_RESOLVED: Record<TicketStatus, boolean> = {
  open: false,
  in_progress: false,
  waiting_on_customer: false,
  resolved: true,
  closed: true,
};

export async function seedTickets(ctx: SeedContext): Promise<void> {
  const ticketModel = model<TicketDocument>(ctx.app, Ticket.name);
  const counterModel = model<TicketCounterDocument>(
    ctx.app,
    TicketCounter.name,
  );

  const agents = supportStaff(ctx);
  const publishedArticles = ctx.pools.kbArticles.filter(
    (a) => a.status === 'published',
  );
  if (!ctx.pools.customers.length || !agents.length) return;

  const statuses = distribute(TICKET_STATUS_MIX, VOLUMES.tickets);
  const priorities = distribute(TICKET_PRIORITY_MIX, VOLUMES.tickets);
  const types = distribute(TICKET_TYPE_MIX, VOLUMES.tickets);

  const docs: Record<string, unknown>[] = [];
  const refs: TicketRef[] = [];

  for (let i = 0; i < VOLUMES.tickets; i++) {
    const status = statuses[i];
    const priority = priorities[i];
    const type = types[i];
    const customer = pick(ctx.pools.customers);
    const agent = pick(agents);

    const createdAt = between(customer.createdAt, addHours(NOW, -2));
    const comments: Record<string, unknown>[] = [
      {
        authorId: customer.keycloakId,
        authorRole: 'customer',
        body: pick(CUSTOMER_OPENERS),
        isInternal: false,
        postedAt: createdAt,
      },
    ];

    let cursor = createdAt;
    let firstResponseAt: Date | undefined;

    // Urgent tickets get answered in minutes, low-priority ones in days.
    const responseHours =
      priority === 'urgent'
        ? int(1, 4)
        : priority === 'high'
          ? int(2, 12)
          : priority === 'normal'
            ? int(4, 48)
            : int(12, 96);

    // ~6% of open tickets never got a first reply — those are the SLA misses
    // the dashboard is supposed to surface, so they are left unanswered.
    const answered = status !== 'open' || chance(0.94);

    if (answered) {
      // An internal triage note often precedes the public reply.
      if (chance(0.35)) {
        const noteAt = addHours(cursor, int(1, responseHours));
        if (noteAt < NOW) {
          comments.push({
            authorId: agent.keycloakId,
            authorRole: 'staff',
            body: pick(INTERNAL_NOTES),
            isInternal: true,
            postedAt: noteAt,
          });
          cursor = noteAt;
        }
      }

      const replyAt = addHours(createdAt, responseHours);
      if (replyAt < NOW) {
        comments.push({
          authorId: agent.keycloakId,
          authorRole: 'staff',
          body: pick(STAFF_REPLIES),
          isInternal: false,
          postedAt: replyAt,
        });
        // firstResponseAt is the first *public* staff comment, by definition.
        firstResponseAt = replyAt;
        cursor = replyAt;
      }
    }

    // Back-and-forth after the first response.
    const exchanges = firstResponseAt ? int(0, 3) : 0;
    for (let e = 0; e < exchanges; e++) {
      const customerAt = addHours(cursor, int(2, 40));
      if (customerAt >= NOW) break;
      comments.push({
        authorId: customer.keycloakId,
        authorRole: 'customer',
        body: pick(CUSTOMER_FOLLOWUPS),
        isInternal: false,
        postedAt: customerAt,
      });
      cursor = customerAt;

      const staffAt = addHours(cursor, int(1, 24));
      if (staffAt >= NOW) break;
      comments.push({
        authorId: agent.keycloakId,
        authorRole: 'staff',
        body: pick(STAFF_REPLIES),
        isInternal: chance(0.2),
        postedAt: staffAt,
      });
      cursor = staffAt;
    }

    let resolvedAt: Date | undefined;
    let closedAt: Date | undefined;

    if (IS_RESOLVED[status] && firstResponseAt) {
      resolvedAt = addHours(cursor, int(1, 72));
      if (resolvedAt >= NOW) resolvedAt = between(cursor, NOW);
      comments.push({
        authorId: agent.keycloakId,
        authorRole: 'staff',
        body: pick(RESOLUTIONS),
        isInternal: false,
        postedAt: resolvedAt,
      });
      cursor = resolvedAt;

      if (status === 'closed') {
        closedAt = momentAfter(resolvedAt, 0, 5);
        // momentAfter re-rolls the time of day, so a same-day result can land
        // before the resolution — never let the close precede it.
        if (closedAt <= resolvedAt) closedAt = addHours(resolvedAt, int(1, 8));
        if (closedAt >= NOW) closedAt = between(resolvedAt, NOW);
        cursor = closedAt;
      }
    }

    // A ticket that could not reach its assigned status (no reply fit inside
    // the window) is downgraded rather than left with impossible timestamps.
    const effectiveStatus: TicketStatus =
      IS_RESOLVED[status] && !resolvedAt
        ? firstResponseAt
          ? 'in_progress'
          : 'open'
        : status;

    const id = new Types.ObjectId();
    const number = `TKT-${COUNTER_START + 1 + i}`;
    const subject = pick(SUBJECTS[type]);

    docs.push({
      _id: id,
      organizationId: ctx.organizationId,
      number,
      subject,
      description: pick(CUSTOMER_OPENERS),
      type,
      status: effectiveStatus,
      priority,
      customerId: customer.id,
      comments,
      relatedArticleIds:
        publishedArticles.length && chance(0.3)
          ? sample(publishedArticles, int(1, 2)).map((a) => a.id)
          : [],
      firstResponseAt,
      resolvedAt,
      closedAt,
      createdBy: customer.keycloakId,
      // Unanswered tickets sit in the unassigned queue, as they would in life.
      assignedToId: firstResponseAt ? agent.keycloakId : undefined,
      assignedTeamId: firstResponseAt ? agent.teamId : undefined,
      createdAt,
      updatedAt: cursor,
    });

    refs.push({
      id,
      number,
      subject,
      status: effectiveStatus,
      ownerId: firstResponseAt ? agent.keycloakId : undefined,
      createdAt,
    });
  }

  await ctx.insert('tickets', ticketModel, docs);

  // Advance the shared counter past the seeded range so the next ticket
  // created through the API doesn't collide with a seeded number.
  await counterModel.updateOne(
    { _id: COUNTER_ID },
    { $set: { seq: COUNTER_START + VOLUMES.tickets } },
    { upsert: true },
  );
  ctx.manifest.trackCounter(COUNTER_ID);
  await ctx.manifest.flush();

  ctx.pools.tickets = refs;

  const unanswered = refs.filter((t) => !t.ownerId).length;
  ctx.logger.log(
    `  ${refs.length} tickets — ${unanswered} still awaiting a first response`,
  );
}
