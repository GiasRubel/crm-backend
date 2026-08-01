/**
 * Step 02 — B2B accounts and the people who work at them.
 *
 * Accounts are firmographically coherent (revenue tracks headcount, region
 * tracks the owning sales team) and every account gets exactly one primary
 * contact, which is what the account 360° view expects.
 */
import { Types } from 'mongoose';
import {
  Account,
  AccountDocument,
  ACCOUNT_INDUSTRIES,
  ACCOUNT_SIZES,
  type AccountSize,
} from '../../../src/accounts/account.schema';
import {
  Contact,
  ContactDocument,
  INTERACTION_TYPES,
  PREFERRED_CHANNELS,
} from '../../../src/contacts/contact.schema';
import {
  ACCOUNT_STATUS_MIX,
  REGIONS,
  REVENUE_BANDS,
  VOLUMES,
  type RegionKey,
} from '../config';
import {
  AccountRef,
  ContactRef,
  model,
  salesStaff,
  SeedContext,
  StaffRef,
} from '../context';
import {
  ascendingMoments,
  between,
  chance,
  distribute,
  faker,
  historyMoment,
  int,
  NOW,
  pick,
  weighted,
} from '../rng';

/** Employee-count band mix — most B2B books skew to SMB and mid-market. */
const SIZE_MIX = [
  { value: '1-10' as AccountSize, weight: 12 },
  { value: '11-50' as AccountSize, weight: 26 },
  { value: '51-200' as AccountSize, weight: 30 },
  { value: '201-500' as AccountSize, weight: 18 },
  { value: '501-1000' as AccountSize, weight: 9 },
  { value: '1000+' as AccountSize, weight: 5 },
];

const REGION_MIX = [
  { value: 'emea' as RegionKey, weight: 40 },
  { value: 'amer' as RegionKey, weight: 42 },
  { value: 'apac' as RegionKey, weight: 18 },
];

const DEPARTMENTS = [
  { name: 'Executive', titles: ['CEO', 'COO', 'Managing Director', 'Founder'] },
  {
    name: 'Finance',
    titles: [
      'CFO',
      'Finance Director',
      'Financial Controller',
      'Accounts Payable Lead',
    ],
  },
  {
    name: 'IT',
    titles: [
      'CTO',
      'Head of IT',
      'IT Manager',
      'Systems Administrator',
      'Solutions Architect',
    ],
  },
  {
    name: 'Operations',
    titles: [
      'COO',
      'Operations Manager',
      'Head of Operations',
      'Logistics Coordinator',
    ],
  },
  {
    name: 'Sales',
    titles: [
      'VP Sales',
      'Sales Director',
      'Account Executive',
      'Sales Operations Manager',
    ],
  },
  {
    name: 'Marketing',
    titles: [
      'CMO',
      'Head of Marketing',
      'Marketing Manager',
      'Demand Generation Lead',
    ],
  },
  {
    name: 'Procurement',
    titles: ['Head of Procurement', 'Procurement Manager', 'Vendor Manager'],
  },
  {
    name: 'HR',
    titles: ['CHRO', 'Head of People', 'HR Manager', 'Talent Partner'],
  },
];

const INTERACTION_SUBJECTS: Record<string, string[]> = {
  call: [
    'Intro call',
    'Discovery call',
    'Follow-up call',
    'Quarterly check-in',
    'Renewal discussion',
  ],
  email: [
    'Sent pricing overview',
    'Shared onboarding guide',
    'Contract draft',
    'Re: integration questions',
    'Proposal follow-up',
  ],
  meeting: [
    'Product demo',
    'Technical deep-dive',
    'Stakeholder workshop',
    'QBR',
    'Kick-off meeting',
  ],
  sms: ['Reminder sent', 'Confirmed meeting time', 'Quick availability check'],
  note: [
    'Left voicemail',
    'Referred by partner',
    'Budget cycle starts in Q3',
    'Prefers email contact',
    'Champion changed roles',
  ],
};

const INTERACTION_NOTES = [
  'Walked through the reporting module; they want per-team dashboards.',
  'Budget approved for next quarter, procurement to be looped in.',
  'Currently on a competitor contract, renewal window opens in six months.',
  'Asked about SSO and data residency before moving forward.',
  'Wants a pilot with two teams before a company-wide rollout.',
  'Main blocker is migrating their existing spreadsheets.',
  'Happy with the trial so far; needs sign-off from finance.',
  'Requested a reference customer in the same industry.',
];

/** Picks an owner from the sales staff covering `region`. */
export function ownerForRegion(ctx: SeedContext, region: RegionKey): StaffRef {
  const pool = salesStaff(ctx);
  const regional = pool.filter((s) => s.region === region);
  return pick(regional.length ? regional : pool);
}

function companyName(taken: Set<string>): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    const name = faker.company.name();
    const key = name.toLowerCase();
    if (!taken.has(key)) {
      taken.add(key);
      return name;
    }
  }
  // Deterministic fallback — a suffix is better than a duplicate-key crash.
  const name = `${faker.company.name()} ${faker.string.alphanumeric(4).toUpperCase()}`;
  taken.add(name.toLowerCase());
  return name;
}

function personEmail(
  first: string,
  last: string,
  company: string,
  taken: Set<string>,
): string {
  const domain =
    company
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 18) || 'example';
  const base = `${first}.${last}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z.]/g, '');
  let email = `${base}@${domain}.com`;
  let n = 2;
  while (taken.has(email)) {
    email = `${base}${n}@${domain}.com`;
    n += 1;
  }
  taken.add(email);
  return email;
}

export async function seedAccountsAndContacts(ctx: SeedContext): Promise<void> {
  const accountModel = model<AccountDocument>(ctx.app, Account.name);
  const contactModel = model<ContactDocument>(ctx.app, Contact.name);

  const takenNames = new Set<string>();
  const takenEmails = new Set<string>();
  const accountDocs: Record<string, unknown>[] = [];
  const accountRefs: AccountRef[] = [];

  const statuses = distribute(ACCOUNT_STATUS_MIX, VOLUMES.accounts);

  for (let i = 0; i < VOLUMES.accounts; i++) {
    const region = weighted(REGION_MIX);
    const size = weighted(SIZE_MIX);
    const owner = ownerForRegion(ctx, region);
    const name = companyName(takenNames);
    const createdAt = historyMoment();
    const status = statuses[i];
    const revenue = REVENUE_BANDS[size];
    const country = pick(REGIONS[region].slice(1));

    const id = new Types.ObjectId();
    accountDocs.push({
      _id: id,
      organizationId: ctx.organizationId,
      name,
      industry: pick(ACCOUNT_INDUSTRIES),
      website: `https://www.${name.toLowerCase().replace(/[^a-z0-9]+/g, '')}.com`,
      email: `info@${name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '')
        .slice(0, 18)}.com`,
      phone: faker.phone.number({ style: 'international' }),
      size,
      // Revenue is drawn from the band matching headcount, so the
      // "revenue by company size" report isn't nonsense.
      annualRevenue: int(revenue.min, revenue.max),
      address: `${faker.location.streetAddress()}, ${faker.location.city()}, ${country}`,
      description: faker.company.catchPhrase(),
      status,
      createdBy: owner.keycloakId,
      assignedToId: owner.keycloakId,
      assignedTeamId: owner.teamId,
      createdAt,
      updatedAt: between(createdAt, NOW),
    });

    accountRefs.push({
      id,
      name,
      size,
      region,
      ownerId: owner.keycloakId,
      teamId: owner.teamId,
      createdAt,
    });
  }

  await ctx.insert('accounts', accountModel, accountDocs);
  ctx.pools.accounts = accountRefs;

  // ── Contacts ────────────────────────────────────────────────────────────
  // Every account gets one primary contact first; the remainder are spread
  // across accounts weighted by company size (bigger companies, more people).
  const contactDocs: Record<string, unknown>[] = [];
  const contactRefs: ContactRef[] = [];

  const buildContact = (account: AccountRef, isPrimary: boolean): void => {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const email = personEmail(firstName, lastName, account.name, takenEmails);
    const department = pick(DEPARTMENTS);
    const createdAt = between(account.createdAt, NOW);
    const doNotContact = chance(0.08);
    const owner =
      ctx.pools.staff.find((s) => s.keycloakId === account.ownerId) ??
      ownerForRegion(ctx, account.region);

    const interactionCount = isPrimary ? int(1, 6) : int(0, 4);
    const moments = ascendingMoments(createdAt, interactionCount, 21);
    const interactions = moments.map((occurredAt) => {
      const type = pick(INTERACTION_TYPES);
      return {
        type,
        // Notes aren't directional; every other channel is.
        direction: type === 'note' ? undefined : pick(['inbound', 'outbound']),
        subject: pick(INTERACTION_SUBJECTS[type]),
        note: chance(0.6) ? pick(INTERACTION_NOTES) : undefined,
        recordedBy: owner.keycloakId,
        occurredAt,
      };
    });

    const id = new Types.ObjectId();
    contactDocs.push({
      _id: id,
      organizationId: ctx.organizationId,
      firstName,
      lastName,
      email,
      phone: faker.phone.number({ style: 'international' }),
      jobTitle: pick(department.titles),
      department: department.name,
      birthday: faker.date.birthdate({ min: 24, max: 62, mode: 'age' }),
      address: faker.location.streetAddress(),
      city: faker.location.city(),
      country: pick(REGIONS[account.region].slice(1)),
      language:
        account.region === 'emea' ? pick(['en', 'de', 'fr', 'nl']) : 'en',
      accountId: account.id,
      isPrimary,
      preferredChannel: pick(PREFERRED_CHANNELS),
      // doNotContact is a hard stop, so every opt-in must be off with it.
      emailOptIn: !doNotContact && chance(0.85),
      phoneOptIn: !doNotContact && chance(0.65),
      smsOptIn: !doNotContact && chance(0.3),
      doNotContact,
      interactions,
      notes: chance(0.35) ? pick(INTERACTION_NOTES) : undefined,
      createdBy: owner.keycloakId,
      assignedToId: owner.keycloakId,
      assignedTeamId: owner.teamId,
      createdAt,
      updatedAt: interactions.length
        ? interactions[interactions.length - 1].occurredAt
        : createdAt,
    });

    contactRefs.push({
      id,
      firstName,
      lastName,
      email,
      accountId: account.id,
      ownerId: owner.keycloakId,
      teamId: owner.teamId,
      createdAt,
    });
  };

  for (const account of accountRefs) buildContact(account, true);

  const remaining = VOLUMES.contacts - accountRefs.length;
  const sizeWeight: Record<AccountSize, number> = {
    '1-10': 1,
    '11-50': 2,
    '51-200': 4,
    '201-500': 6,
    '501-1000': 8,
    '1000+': 10,
  };
  const weightedAccounts = accountRefs.map((a) => ({
    value: a,
    weight: sizeWeight[a.size],
  }));
  for (let i = 0; i < remaining; i++) {
    buildContact(weighted(weightedAccounts), false);
  }

  await ctx.insert('contacts', contactModel, contactDocs);
  ctx.pools.contacts = contactRefs;

  ctx.logger.log(
    `  ${accountRefs.length} accounts, ${contactRefs.length} contacts ` +
      `(${ACCOUNT_SIZES.length} size bands, ${ACCOUNT_INDUSTRIES.length} industries)`,
  );
}
