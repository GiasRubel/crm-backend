/**
 * Step 06 — knowledge base.
 *
 * Runs before tickets because ~30% of tickets link a published article as a
 * candidate resolution. Slugs carry a unique index, so they are deduped here
 * rather than being left to collide at insert time.
 */
import { Types } from 'mongoose';
import {
  KbArticle,
  KbArticleDocument,
} from '../../../src/kb/kb-article.schema';
import { VOLUMES } from '../config';
import { adminStaff, KbArticleRef, model, SeedContext } from '../context';
import {
  between,
  chance,
  historyMoment,
  int,
  NOW,
  pick,
  shuffle,
} from '../rng';

interface ArticleSpec {
  title: string;
  category: string;
  tags: string[];
  body: string;
}

const CATEGORIES: Record<string, string[]> = {
  'getting-started': [
    'Creating your first customer record',
    'Inviting your team and assigning roles',
    'Setting up territories and teams',
    'Importing contacts from a spreadsheet',
    'A tour of the dashboard',
    'Connecting your email address',
    'Choosing between accounts and contacts',
    'Understanding the lead lifecycle',
    'Customising your list view columns',
    'Keyboard shortcuts worth learning',
  ],
  billing: [
    'Understanding your invoice',
    'Changing your billing address',
    'Updating a saved payment method',
    'What happens when a payment fails',
    'Requesting a VAT receipt',
    'Upgrading or downgrading a plan',
    'Cancelling a subscription',
    'Reading the usage section of your invoice',
    'Adding a purchase order number to invoices',
    'Refund policy for annual plans',
  ],
  'how-to': [
    'How to convert a lead into a customer',
    'How to move a deal between pipeline stages',
    'How to log a call against a contact',
    'How to build a custom report',
    'How to schedule a follow-up reminder',
    'How to export a list to CSV',
    'How to merge duplicate contacts',
    'How to set up an automation rule',
    'How to escalate a support ticket',
    'How to share a saved report with your team',
    'How to reassign records when someone leaves',
    'How to add an internal note to a ticket',
    'How to bulk update a list of records',
    'How to link a contact to an account',
    'How to record a lost deal and its reason',
  ],
  troubleshooting: [
    'I cannot sign in to my account',
    'My password reset email never arrived',
    'A record is missing from my list view',
    'Reports show no data for this period',
    'Automation rule did not fire',
    'Ticket notifications are not arriving',
    'CSV export is missing columns',
    'Duplicate leads keep appearing',
    'Calendar invites are not being accepted',
    'The dashboard is slow to load',
    'A team member cannot see shared records',
  ],
  integrations: [
    'Connecting a webhook to an external system',
    'Using the lead capture API',
    'Single sign-on with your identity provider',
    'Calendar sync and ICS exports',
    'Sending outbound email through your own SMTP',
    'Embedding the web lead capture form',
    'Rate limits on the public API',
    'Verifying webhook signatures',
  ],
  security: [
    'How we store and encrypt your data',
    'Managing user permissions and roles',
    'Row-level visibility explained',
    'Requesting a data export or deletion',
    'Two-factor authentication options',
    'Session timeouts and device sign-out',
    'Audit trails on record changes',
  ],
  policies: [
    'Service level agreement targets',
    'Support hours and response times',
    'Data retention policy',
    'Acceptable use policy',
    'Sub-processors and data residency',
    'Incident notification commitments',
  ],
};

const BODY_TEMPLATES = [
  (title: string) =>
    `## Overview\n\n${title} is one of the most common tasks in the CRM. This article walks through it step by step.\n\n## Before you start\n\nMake sure you have the right role — some of these actions are restricted to Admin users.\n\n## Steps\n\n1. Open the relevant record from the main navigation.\n2. Use the action menu in the top right.\n3. Confirm the change and check the audit trail.\n\n## Troubleshooting\n\nIf the option is greyed out, your role probably doesn't allow it. Ask an administrator to review your permissions.`,
  (title: string) =>
    `${title}\n\n### What this covers\n\nThis page explains the behaviour in detail and lists the edge cases our support team sees most often.\n\n### Key points\n\n- Changes take effect immediately and are visible to everyone on your team.\n- Deleted records are not recoverable from the interface.\n- Bulk operations are limited to 500 records at a time.\n\n### Related\n\nSee the getting started guides for a broader walkthrough, or contact support if you're still stuck.`,
  (title: string) =>
    `### Summary\n\n${title}.\n\n### Details\n\nThe CRM applies row-level visibility to every list: you see records you own, records routed to one of your teams, and records you created. Administrators see everything.\n\n### Frequently asked\n\n**Does this apply to reports?** Yes — report results respect the same visibility rules.\n\n**Can I change it?** Visibility follows team membership; ask an administrator to adjust your teams.`,
];

function slugify(title: string, taken: Set<string>): string {
  const base = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  let slug = base;
  let n = 2;
  while (taken.has(slug)) {
    slug = `${base}-${n}`;
    n += 1;
  }
  taken.add(slug);
  return slug;
}

export async function seedKbArticles(ctx: SeedContext): Promise<void> {
  const kbModel = model<KbArticleDocument>(ctx.app, KbArticle.name);

  const specs: ArticleSpec[] = [];
  for (const [category, titles] of Object.entries(CATEGORIES)) {
    for (const title of titles) {
      specs.push({
        title,
        category,
        tags: [
          category,
          ...title
            .toLowerCase()
            .split(' ')
            .filter((w) => w.length > 5)
            .slice(0, 2),
        ],
        body: pick(BODY_TEMPLATES)(title),
      });
    }
  }

  const chosen = shuffle(specs).slice(0, VOLUMES.kbArticles);
  const authors = adminStaff(ctx).length ? adminStaff(ctx) : ctx.pools.staff;
  const takenSlugs = new Set<string>();
  const docs: Record<string, unknown>[] = [];
  const refs: KbArticleRef[] = [];

  chosen.forEach((spec, i) => {
    // 45 published (25 public FAQ, 20 internal wiki), 10 draft, 5 archived.
    const status = i < 45 ? 'published' : i < 55 ? 'draft' : 'archived';
    const visibility = status === 'published' && i < 25 ? 'public' : 'internal';
    const author = pick(authors);
    const createdAt = historyMoment();
    const publishedAt =
      status === 'published' ? between(createdAt, NOW) : undefined;

    // Only published public articles accumulate FAQ engagement counters.
    const views =
      status === 'published'
        ? int(
            visibility === 'public' ? 80 : 5,
            visibility === 'public' ? 4200 : 300,
          )
        : 0;
    const helpfulCount = views ? int(0, Math.floor(views * 0.12)) : 0;
    const notHelpfulCount = views ? int(0, Math.floor(views * 0.03)) : 0;

    const id = new Types.ObjectId();
    docs.push({
      _id: id,
      organizationId: ctx.organizationId,
      title: spec.title,
      slug: slugify(spec.title, takenSlugs),
      body: spec.body,
      category: spec.category,
      tags: spec.tags,
      status,
      visibility,
      authorId: author.keycloakId,
      updatedById: chance(0.4) ? pick(authors).keycloakId : undefined,
      publishedAt,
      views,
      helpfulCount,
      notHelpfulCount,
      createdAt,
      updatedAt: publishedAt ?? createdAt,
    });

    refs.push({ id, title: spec.title, status, visibility });
  });

  await ctx.insert('kbarticles', kbModel, docs);
  ctx.pools.kbArticles = refs;

  const published = refs.filter((a) => a.status === 'published');
  ctx.logger.log(
    `  ${refs.length} articles — ${published.length} published ` +
      `(${published.filter((a) => a.visibility === 'public').length} on the public FAQ)`,
  );
}
