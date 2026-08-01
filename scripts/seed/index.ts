/**
 * Demo data seeder — fills every backend module with a coherent ~18 month
 * history for one medium-sized company. See ../../SEED-DATA-PLAN.md.
 *
 *   yarn seed          # append a fresh dataset
 *   yarn seed:fresh    # remove previously seeded data, then seed
 *   yarn seed:reset    # remove previously seeded data and stop
 *   yarn seed:verify   # re-check integrity of the data already present
 *
 * Writes go through Mongoose models with `timestamps: false` rather than the
 * feature services, deliberately: services would stamp createdAt = now
 * (destroying the history) and emit CrmEventBus events that would fire the
 * automation engine mid-seed. The invariants services would have enforced are
 * asserted afterwards by ./verify.ts instead.
 */
import { Logger, LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { DefaultOrgService } from '../../src/bootstrap/default-org.service';
import { buildContext, SeedContext } from './context';
import { SeedKeycloak } from './keycloak';
import { resetSeedData, SeedManifest } from './manifest';
import { NOW, HISTORY_START } from './rng';
import { SEED_PASSWORD } from './config';
import { verifySeed } from './verify';

import { seedTeamsAndUsers } from './steps/01-teams-users';
import { seedAccountsAndContacts } from './steps/02-accounts-contacts';
import { seedLeads } from './steps/03-leads';
import { seedCustomers } from './steps/04-customers';
import { seedOpportunities } from './steps/05-opportunities';
import { seedKbArticles } from './steps/06-kb';
import { seedTickets } from './steps/07-tickets';
import { seedActivities } from './steps/08-activities';
import { seedAutomations } from './steps/09-automations';
import { seedSavedReports } from './steps/10-saved-reports';

interface Step {
  name: string;
  run: (ctx: SeedContext, kc: SeedKeycloak) => Promise<void>;
}

const STEPS: Step[] = [
  { name: 'teams + staff users', run: seedTeamsAndUsers },
  { name: 'accounts + contacts', run: seedAccountsAndContacts },
  { name: 'leads', run: seedLeads },
  { name: 'customers + conversions', run: seedCustomers },
  { name: 'opportunities', run: seedOpportunities },
  { name: 'knowledge base', run: seedKbArticles },
  { name: 'tickets', run: seedTickets },
  { name: 'activities', run: seedActivities },
  { name: 'automations', run: seedAutomations },
  { name: 'saved reports', run: seedSavedReports },
];

const LOG_LEVELS: LogLevel[] = ['error', 'warn'];

function fmt(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const fresh = args.has('--fresh');
  const resetOnly = args.has('--reset-only');
  const verifyOnly = args.has('--verify-only');

  const logger = new Logger('seed');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: LOG_LEVELS,
  });

  try {
    const organizationId = await app
      .get(DefaultOrgService)
      .getDefaultOrganizationId();

    const ctx = buildContext(app, organizationId);
    const keycloak = new SeedKeycloak(app, ctx.manifest);

    if (fresh || resetOnly) {
      logger.log('Removing previously seeded data…');
      const summary = await resetSeedData(ctx.conn, keycloak.deleter);
      logger.log(
        `Removed ${summary.documents} documents and ${summary.keycloakUsers} Keycloak users.`,
      );
      if (resetOnly) return;
    }

    if (verifyOnly) {
      const manifest = await SeedManifest.read(ctx.conn);
      if (!manifest) {
        logger.warn('No seed manifest found — nothing to verify.');
        return;
      }
      await verifySeed(ctx);
      return;
    }

    const existing = await SeedManifest.read(ctx.conn);
    if (existing) {
      logger.warn(
        'A previous seed run is already present. This run will append to it — ' +
          'use "yarn seed:fresh" to replace it instead.',
      );
    }

    logger.log(
      `Seeding organization ${organizationId.toString()} — history ${fmt(HISTORY_START)} → ${fmt(NOW)}`,
    );

    const startedAt = Date.now();
    for (const [i, step] of STEPS.entries()) {
      const stepStart = Date.now();
      logger.log(`[${i + 1}/${STEPS.length}] ${step.name}…`);
      await step.run(ctx, keycloak);
      logger.log(
        `[${i + 1}/${STEPS.length}] ${step.name} done in ${((Date.now() - stepStart) / 1000).toFixed(1)}s`,
      );
    }
    await ctx.manifest.flush();

    logger.log(
      `Seed complete in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
    );
    printSummary(ctx);
    await verifySeed(ctx);
  } finally {
    await app.close();
  }
}

function printSummary(ctx: SeedContext): void {
  const p = ctx.pools;
  const rows: [string, number][] = [
    ['teams', p.teams.length],
    ['staff users', p.staff.length],
    ['accounts', p.accounts.length],
    ['contacts', p.contacts.length],
    ['customers', p.customers.length],
    ['leads', p.leads.length],
    ['opportunities', p.opportunities.length],
    ['kb articles', p.kbArticles.length],
    ['tickets', p.tickets.length],
  ];

  console.log('\n  Seeded');
  console.log('  ' + '─'.repeat(34));
  for (const [label, count] of rows) {
    console.log(`  ${label.padEnd(20)}${String(count).padStart(8)}`);
  }

  console.log('\n  Staff logins (password: ' + SEED_PASSWORD + ')');
  console.log('  ' + '─'.repeat(70));
  for (const staff of ctx.pools.staff) {
    const team = ctx.pools.teams.find((t) => t.id.equals(staff.teamId));
    console.log(
      `  ${staff.email.padEnd(38)}${staff.role.padEnd(16)}${team?.name ?? ''}`,
    );
  }
  console.log('');
}

main().catch((error) => {
  new Logger('seed').error(
    error instanceof Error ? error.stack : String(error),
  );
  process.exit(1);
});
