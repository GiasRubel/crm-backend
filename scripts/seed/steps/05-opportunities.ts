/**
 * Step 05 — the sales pipeline.
 *
 * The invariants that make the Kanban board and the funnel report believable:
 *  - `probability` is always `STAGE_PROBABILITY[stage]`, never a free number;
 *  - `stageHistory` is a forward-only walk from `discovery` to the current
 *    stage with strictly increasing timestamps, and its last `to` equals
 *    `stage`;
 *  - closed deals have `closedAt` in the past and a past `expectedCloseDate`;
 *    open deals have a future one;
 *  - every `closed_lost` deal carries a `lostReason`.
 *
 * Deals that came from a converted lead also close the conversion loop by
 * writing `convertedOpportunityId` back onto the lead.
 */
import { Types } from 'mongoose';
import {
  CLOSED_STAGES,
  Opportunity,
  OpportunityDocument,
  STAGE_PROBABILITY,
  type OpportunityStage,
} from '../../../src/opportunities/opportunity.schema';
import { Lead, LeadDocument } from '../../../src/leads/lead.schema';
import { DEAL_BANDS, OPPORTUNITY_STAGE_MIX, VOLUMES } from '../config';
import { model, OpportunityRef, SeedContext } from '../context';
import {
  addDays,
  between,
  chance,
  distribute,
  futureMoment,
  int,
  momentAfter,
  NOW,
  pick,
} from '../rng';

/** The ordered open stages a deal walks through before closing. */
const STAGE_PATH: OpportunityStage[] = ['discovery', 'proposal', 'negotiation'];

const LOST_REASONS = [
  'Lost to a competitor on price',
  'Budget cut for the fiscal year',
  'No decision — project shelved',
  'Missing must-have integration',
  'Champion left the company',
  'Chose to build in-house',
  'Timeline slipped past our quarter',
  'Procurement blocked on security review',
];

const DEAL_SUFFIXES = [
  'Platform Rollout',
  'Annual Licence',
  'Pilot Programme',
  'Team Expansion',
  'Enterprise Upgrade',
  'Renewal',
  'Multi-Site Deployment',
  'Onboarding Package',
];

const NOTES = [
  'Procurement wants a three-year term with an annual break clause.',
  'Two competitors in the running; we lead on reporting.',
  'Pilot approved for 20 seats, expansion to 150 planned.',
  'Security review completed, waiting on legal.',
  'Discount requested — pending manager approval.',
  'Champion is the head of operations, economic buyer is the CFO.',
];

/**
 * Builds the stage walk for a deal that ended at `finalStage`, starting at
 * `openedAt`. Returns the transitions plus the moment the deal closed
 * (undefined while it is still open).
 */
function buildStageHistory(
  finalStage: OpportunityStage,
  openedAt: Date,
  movedBy: string,
): { history: Record<string, unknown>[]; closedAt?: Date; lastMoveAt: Date } {
  const isClosed = CLOSED_STAGES.includes(finalStage);
  const openTarget = isClosed
    ? STAGE_PATH.length - 1
    : STAGE_PATH.indexOf(finalStage);

  const history: Record<string, unknown>[] = [];
  let cursor = openedAt;
  let from: OpportunityStage = 'discovery';

  // Walk the open stages up to (and including) the deal's high-water mark.
  for (let i = 1; i <= openTarget; i++) {
    const movedAt = momentAfter(cursor, 3, 30);
    if (movedAt >= NOW) break;
    history.push({ from, to: STAGE_PATH[i], movedBy, movedAt });
    from = STAGE_PATH[i];
    cursor = movedAt;
  }

  if (!isClosed) {
    return { history, lastMoveAt: cursor };
  }

  // A closed deal always has a final transition into its closed stage.
  let closedAt = momentAfter(cursor, 2, 25);
  if (closedAt >= NOW) closedAt = between(cursor, NOW);
  history.push({ from, to: finalStage, movedBy, movedAt: closedAt });
  return { history, closedAt, lastMoveAt: closedAt };
}

export async function seedOpportunities(ctx: SeedContext): Promise<void> {
  const opportunityModel = model<OpportunityDocument>(
    ctx.app,
    Opportunity.name,
  );
  const leadModel = model<LeadDocument>(ctx.app, Lead.name);

  const stages = distribute(OPPORTUNITY_STAGE_MIX, VOLUMES.opportunities);
  const convertedLeads = ctx.pools.leads.filter(
    (l) => l.status === 'converted',
  );

  // Converted leads must each own exactly one opportunity; the rest of the
  // pipeline is direct business against existing customers. The lead and its
  // customer are matched on email rather than array position, so a change to
  // the ordering in step 04 can't silently mis-pair them.
  const customerByEmail = new Map(
    ctx.pools.customers.map((c) => [c.email.toLowerCase(), c]),
  );
  const leadCustomerPairs = convertedLeads
    .map((lead) => ({
      lead,
      customer: customerByEmail.get(lead.email.toLowerCase()),
    }))
    .filter(
      (
        p,
      ): p is {
        lead: (typeof convertedLeads)[number];
        customer: NonNullable<typeof p.customer>;
      } => Boolean(p.customer),
    );

  const docs: Record<string, unknown>[] = [];
  const refs: OpportunityRef[] = [];
  const leadUpdates: { updateOne: { filter: object; update: object } }[] = [];

  for (let i = 0; i < VOLUMES.opportunities; i++) {
    const stage = stages[i];
    const pair = leadCustomerPairs[i];

    const customer = pair?.customer ?? pick(ctx.pools.customers);
    if (!customer) continue;

    const account = customer.accountId
      ? ctx.pools.accounts.find((a) => a.id.equals(customer.accountId))
      : pick(ctx.pools.accounts);

    const ownerId = customer.ownerId;
    const teamId = customer.teamId;
    const openedAt = between(customer.createdAt, addDays(NOW, -7));

    const { history, closedAt, lastMoveAt } = buildStageHistory(
      stage,
      openedAt,
      ownerId,
    );
    // A deal whose walk got truncated by the end of the window sits at
    // whatever stage it actually reached — never a stage it never entered.
    const effectiveStage = history.length
      ? (history[history.length - 1].to as OpportunityStage)
      : 'discovery';
    const isClosed = CLOSED_STAGES.includes(effectiveStage);

    const band = DEAL_BANDS[account?.size ?? '51-200'];
    const amount = Math.round(int(band.min, band.max) / 100) * 100;

    const id = new Types.ObjectId();
    const name = `${account?.name ?? customer.lastName} — ${pick(DEAL_SUFFIXES)}`;

    docs.push({
      _id: id,
      organizationId: ctx.organizationId,
      name,
      customerId: customer.id,
      leadId: pair?.lead.id,
      accountId: account?.id,
      amount,
      stage: effectiveStage,
      // Probability is derived, never invented — same rule the service applies.
      probability: STAGE_PROBABILITY[effectiveStage],
      expectedCloseDate: isClosed
        ? momentAfter(openedAt, 20, 90)
        : futureMoment(5, 120),
      notes: chance(0.45) ? pick(NOTES) : undefined,
      closedAt: isClosed ? closedAt : undefined,
      lostReason:
        effectiveStage === 'closed_lost' ? pick(LOST_REASONS) : undefined,
      stageHistory: history,
      createdBy: pair ? 'system:lead-conversion' : ownerId,
      assignedToId: ownerId,
      assignedTeamId: teamId,
      createdAt: openedAt,
      updatedAt: lastMoveAt,
    });

    refs.push({
      id,
      name,
      stage: effectiveStage,
      amount,
      ownerId,
      teamId,
      createdAt: openedAt,
    });

    if (pair) {
      leadUpdates.push({
        updateOne: {
          filter: { _id: pair.lead.id },
          update: { $set: { convertedOpportunityId: id } },
        },
      });
    }
  }

  await ctx.insert('opportunities', opportunityModel, docs);
  if (leadUpdates.length) {
    await leadModel.bulkWrite(leadUpdates, { timestamps: false });
  }

  ctx.pools.opportunities = refs;

  const won = refs.filter((o) => o.stage === 'closed_won');
  const wonValue = won.reduce((sum, o) => sum + o.amount, 0);
  ctx.logger.log(
    `  ${refs.length} opportunities — ${won.length} won, ` +
      `${wonValue.toLocaleString('en-US')} in closed-won value`,
  );
}
