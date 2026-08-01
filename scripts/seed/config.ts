/**
 * Tunables for the demo seeder. Every volume and ratio lives here so the
 * dataset can be resized without touching the generators.
 */

/**
 * Fixed PRNG seed. Two runs on the same day produce identical data, which
 * makes seeded-data bug reports reproducible.
 */
export const RNG_SEED = 20260801;

/** How far back the generated history reaches. */
export const MONTHS_OF_HISTORY = 18;

/**
 * Volume ramp across the history window: the final month generates this
 * many times more records than the first, so trend charts slope upward.
 */
export const GROWTH_RAMP = 1.6;

/** Email domain for every generated staff member and customer. */
export const EMAIL_DOMAIN = 'northwind-demo.test';

/** Shared password for the staff logins the seeder provisions in Keycloak. */
export const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'Passw0rd!23';

/** Customers that get a real Keycloak account (for testing the portal). */
export const PORTAL_LOGIN_COUNT = 10;

export const VOLUMES = {
  teams: 6,
  staff: 28,
  accounts: 180,
  contacts: 650,
  customers: 240,
  leads: 900,
  opportunities: 420,
  kbArticles: 60,
  tickets: 1400,
  activities: 6000,
  automationRules: 12,
  automationRuns: 800,
  savedReports: 15,
} as const;

/** Lead status distribution. `converted` drives customer/opportunity counts. */
export const LEAD_STATUS_MIX = [
  { value: 'new', weight: 22 },
  { value: 'contacted', weight: 26 },
  { value: 'qualified', weight: 14 },
  { value: 'unqualified', weight: 20 },
  { value: 'converted', weight: 18 },
] as const;

export const LEAD_SOURCE_MIX = [
  { value: 'web_form', weight: 35 },
  { value: 'manual', weight: 25 },
  { value: 'referral', weight: 15 },
  { value: 'event', weight: 12 },
  { value: 'api', weight: 8 },
  { value: 'other', weight: 5 },
] as const;

export const OPPORTUNITY_STAGE_MIX = [
  { value: 'discovery', weight: 60 },
  { value: 'proposal', weight: 40 },
  { value: 'negotiation', weight: 20 },
  { value: 'closed_won', weight: 180 },
  { value: 'closed_lost', weight: 120 },
] as const;

export const TICKET_STATUS_MIX = [
  { value: 'open', weight: 8 },
  { value: 'in_progress', weight: 10 },
  { value: 'waiting_on_customer', weight: 7 },
  { value: 'resolved', weight: 45 },
  { value: 'closed', weight: 30 },
] as const;

export const TICKET_PRIORITY_MIX = [
  { value: 'low', weight: 18 },
  { value: 'normal', weight: 52 },
  { value: 'high', weight: 22 },
  { value: 'urgent', weight: 8 },
] as const;

export const TICKET_TYPE_MIX = [
  { value: 'question', weight: 30 },
  { value: 'problem', weight: 25 },
  { value: 'bug', weight: 18 },
  { value: 'feature_request', weight: 12 },
  { value: 'billing', weight: 10 },
  { value: 'other', weight: 5 },
] as const;

export const ACCOUNT_STATUS_MIX = [
  { value: 'prospect', weight: 35 },
  { value: 'active', weight: 55 },
  { value: 'inactive', weight: 10 },
] as const;

/** Deal-size band per employee-count band, in whole currency units. */
export const DEAL_BANDS: Record<string, { min: number; max: number }> = {
  '1-10': { min: 2_000, max: 12_000 },
  '11-50': { min: 4_000, max: 25_000 },
  '51-200': { min: 15_000, max: 80_000 },
  '201-500': { min: 25_000, max: 120_000 },
  '501-1000': { min: 60_000, max: 250_000 },
  '1000+': { min: 90_000, max: 400_000 },
};

/** Annual revenue band per employee-count band. */
export const REVENUE_BANDS: Record<string, { min: number; max: number }> = {
  '1-10': { min: 250_000, max: 2_000_000 },
  '11-50': { min: 2_000_000, max: 12_000_000 },
  '51-200': { min: 12_000_000, max: 60_000_000 },
  '201-500': { min: 60_000_000, max: 180_000_000 },
  '501-1000': { min: 180_000_000, max: 600_000_000 },
  '1000+': { min: 600_000_000, max: 4_000_000_000 },
};

/** Territory tags used by teams and mirrored onto account addresses. */
export const REGIONS = {
  emea: ['EMEA', 'Germany', 'United Kingdom', 'France', 'Netherlands'],
  amer: ['AMER', 'United States', 'Canada'],
  apac: ['APAC', 'Australia', 'Singapore', 'Japan'],
} as const;

export type RegionKey = keyof typeof REGIONS;
