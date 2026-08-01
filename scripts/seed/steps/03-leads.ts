/**
 * Step 03 — leads with engagement timelines.
 *
 * The score is never invented: it is the clamped sum of the points on the
 * lead's own engagements, exactly as `LeadsService` would compute it. That
 * keeps the derived hot/warm/cold rating consistent with the visible timeline.
 */
import { Types } from 'mongoose';
import {
  ENGAGEMENT_DEFAULT_POINTS,
  ENGAGEMENT_TYPES,
  Lead,
  LeadDocument,
  type EngagementType,
  type LeadStatus,
} from '../../../src/leads/lead.schema';
import {
  LEAD_SOURCE_MIX,
  LEAD_STATUS_MIX,
  REGIONS,
  VOLUMES,
  type RegionKey,
} from '../config';
import { LeadRef, model, SeedContext } from '../context';
import {
  ascendingMoments,
  chance,
  distribute,
  faker,
  historyMoment,
  int,
  pick,
} from '../rng';
import { ownerForRegion } from './02-accounts-contacts';

/**
 * How much engagement each status implies. A `new` lead with a 90 score
 * would be as wrong as a `converted` lead with no touches at all.
 */
const ENGAGEMENT_COUNT_BY_STATUS: Record<LeadStatus, [number, number]> = {
  new: [0, 1],
  contacted: [1, 3],
  qualified: [3, 7],
  unqualified: [1, 4],
  converted: [4, 9],
};

/** Engagement types that make sense early vs. late in the funnel. */
const EARLY_ENGAGEMENTS: EngagementType[] = [
  'website_visit',
  'form_submitted',
  'email_opened',
];
const LATE_ENGAGEMENTS: EngagementType[] = ['email_replied', 'call', 'meeting'];

const LEAD_NOTES = [
  'Downloaded the pricing guide twice this week.',
  'Came in through the partner referral programme.',
  'Met at the trade show — asked for a follow-up in the new quarter.',
  'Evaluating three vendors, decision expected end of quarter.',
  'Small team but growing fast; budget is the main constraint.',
  'Wrong fit — looking for an ERP, not a CRM.',
  'Requested a callback outside business hours.',
  'Existing customer of ours in a different region.',
];

const ENGAGEMENT_NOTES: Record<EngagementType, string[]> = {
  email_opened: ['Opened the intro sequence', 'Opened the pricing email'],
  email_replied: [
    'Replied asking about integrations',
    'Replied with procurement contact',
  ],
  call: ['Discovery call — 20 minutes', 'Left voicemail, called back same day'],
  meeting: ['Product demo with the ops team', 'Technical walkthrough'],
  website_visit: ['Visited the pricing page', 'Read two case studies'],
  form_submitted: ['Submitted the contact form', 'Requested a demo'],
  note: ['Logged by the SDR after a conference', 'Flagged for follow-up'],
};

export async function seedLeads(ctx: SeedContext): Promise<void> {
  const leadModel = model<LeadDocument>(ctx.app, Lead.name);

  const statuses = distribute(LEAD_STATUS_MIX, VOLUMES.leads);
  const sources = distribute(LEAD_SOURCE_MIX, VOLUMES.leads);

  const takenEmails = new Set<string>();
  const docs: Record<string, unknown>[] = [];
  const refs: LeadRef[] = [];

  for (let i = 0; i < VOLUMES.leads; i++) {
    const status = statuses[i];
    const source = sources[i];
    const region = pick(['emea', 'amer', 'apac'] as RegionKey[]);
    const owner = ownerForRegion(ctx, region);
    const createdAt = historyMoment();

    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const company = faker.company.name();
    let email = faker.internet
      .email({ firstName, lastName, provider: 'example.com' })
      .toLowerCase();
    let n = 2;
    while (takenEmails.has(email)) {
      email = email.replace('@', `${n}@`);
      n += 1;
    }
    takenEmails.add(email);

    // Engagements run forward from creation; early-funnel touches first,
    // later-funnel touches once the lead has been worked.
    const [minTouch, maxTouch] = ENGAGEMENT_COUNT_BY_STATUS[status];
    const touchCount = int(minTouch, maxTouch);
    const moments = ascendingMoments(createdAt, touchCount, 14);
    const engagements = moments.map((occurredAt, idx) => {
      const type =
        idx < 2
          ? pick(EARLY_ENGAGEMENTS)
          : pick([...LATE_ENGAGEMENTS, ...EARLY_ENGAGEMENTS]);
      return {
        type,
        points: ENGAGEMENT_DEFAULT_POINTS[type],
        note: chance(0.5) ? pick(ENGAGEMENT_NOTES[type]) : undefined,
        // Unattended ingestion logs the first touch with no staff author.
        recordedBy:
          idx === 0 && (source === 'web_form' || source === 'api')
            ? undefined
            : owner.keycloakId,
        occurredAt,
      };
    });

    const score = Math.min(
      100,
      Math.max(
        0,
        engagements.reduce((sum, e) => sum + e.points, 0),
      ),
    );

    const createdBy =
      source === 'web_form'
        ? 'system:web-form'
        : source === 'api'
          ? 'system:api'
          : owner.keycloakId;

    const id = new Types.ObjectId();
    const lastTouch = engagements.length
      ? engagements[engagements.length - 1].occurredAt
      : createdAt;

    docs.push({
      _id: id,
      organizationId: ctx.organizationId,
      firstName,
      lastName,
      email,
      phone: faker.phone.number({ style: 'international' }),
      company,
      jobTitle: faker.person.jobTitle(),
      notes: chance(0.4) ? pick(LEAD_NOTES) : undefined,
      source,
      status,
      score,
      engagements,
      estimatedValue: chance(0.7) ? int(3, 90) * 1000 : undefined,
      createdBy,
      assignedToId: owner.keycloakId,
      assignedTeamId: owner.teamId,
      createdAt,
      updatedAt: lastTouch,
      // Conversion fields are written back by steps 04 and 05, once the
      // customer and opportunity those fields point at actually exist.
    });

    refs.push({
      id,
      firstName,
      lastName,
      email,
      status,
      ownerId: owner.keycloakId,
      teamId: owner.teamId,
      createdAt: lastTouch,
    });
  }

  await ctx.insert('leads', leadModel, docs);
  ctx.pools.leads = refs;

  const converted = refs.filter((l) => l.status === 'converted').length;
  ctx.logger.log(
    `  ${refs.length} leads across ${ENGAGEMENT_TYPES.length} engagement types ` +
      `(${converted} converted, ${REGIONS.emea[0]}/${REGIONS.amer[0]}/${REGIONS.apac[0]} split)`,
  );
}
