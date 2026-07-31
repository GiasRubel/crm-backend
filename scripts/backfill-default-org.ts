/**
 * One-off migration: creates a single "default" Organization + an active
 * Subscription for it, then stamps organizationId onto every existing
 * document across all tenant-owned collections that doesn't have one yet.
 *
 * Safe to re-run: every step is idempotent (skips the org/subscription if
 * they already exist, and the $set only touches documents still missing
 * organizationId).
 *
 *   yarn migrate:default-org
 */
import { getModelToken } from '@nestjs/mongoose';
import { NestFactory } from '@nestjs/core';
import { Model, Types } from 'mongoose';
import { AppModule } from '../src/app.module';
import { OrganizationsService } from '../src/organizations/organizations.service';
import { SubscriptionsService } from '../src/subscriptions/subscriptions.service';
import { User } from '../src/users/users.schema';
import { Team } from '../src/teams/team.schema';
import { Customer } from '../src/customers/customer.schema';
import { Lead } from '../src/leads/lead.schema';
import { Account } from '../src/accounts/account.schema';
import { Contact } from '../src/contacts/contact.schema';
import { Opportunity } from '../src/opportunities/opportunity.schema';
import { Activity } from '../src/activities/activity.schema';
import { Ticket } from '../src/tickets/ticket.schema';
import { AutomationRule } from '../src/automations/automation-rule.schema';
import { AutomationRun } from '../src/automations/automation-run.schema';
import { KbArticle } from '../src/kb/kb-article.schema';
import { SavedReport } from '../src/reports/saved-report.schema';

const DEFAULT_ORG_NAME = process.env.DEFAULT_ORG_NAME ?? 'Default Organization';
const DEFAULT_ORG_SLUG = process.env.DEFAULT_ORG_SLUG ?? 'default';

/** Every tenant-owned collection that needs organizationId stamped. */
const TENANT_MODELS = [
  User,
  Team,
  Customer,
  Lead,
  Account,
  Contact,
  Opportunity,
  Activity,
  Ticket,
  AutomationRule,
  AutomationRun,
  KbArticle,
  SavedReport,
];

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const organizationsService = app.get(OrganizationsService);
    const subscriptionsService = app.get(SubscriptionsService);

    const existing = await organizationsService
      .findAll()
      .then((orgs) => orgs.find((o) => o.slug === DEFAULT_ORG_SLUG));

    const organization =
      existing ??
      (await organizationsService.create({
        name: DEFAULT_ORG_NAME,
        slug: DEFAULT_ORG_SLUG,
        status: 'active',
      }));

    console.log(`Organization ready: ${organization.id} (${organization.slug})`);

    const hasSubscription = await subscriptionsService
      .findByOrganizationId(organization.id)
      .then(() => true)
      .catch(() => false);

    if (hasSubscription) {
      console.log('Subscription already exists for this organization — skipping.');
    } else {
      const subscription = await subscriptionsService.create({
        organizationId: organization.id,
        // Grandfathered in: no real Stripe customer yet for the backfilled
        // default org. Replace via `subscriptions` endpoints once Stripe
        // integration (phase 6) is wired up.
        stripeCustomerId: 'backfill-no-stripe-customer',
        status: 'active',
      });
      console.log(`Subscription created: ${subscription.id} (status: ${subscription.status})`);
    }

    const orgObjectId = new Types.ObjectId(organization.id);

    console.log('\nStamping organizationId on existing documents:');
    for (const model of TENANT_MODELS) {
      const modelInstance = app.get<Model<any>>(getModelToken(model.name));
      const result = await modelInstance
        .updateMany(
          { organizationId: { $exists: false } },
          { $set: { organizationId: orgObjectId } },
        )
        .exec();
      console.log(
        `  ${model.name}: ${result.modifiedCount} document(s) updated`,
      );
    }

    console.log(`\nDefault organization id: ${organization.id}`);
  } finally {
    await app.close();
  }
}

run().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
