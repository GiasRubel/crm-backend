/**
 * Step 04 — customers, and the lead conversions that produced most of them.
 *
 * Two populations:
 *  - converted leads become customers, and the lead is stamped with
 *    convertedCustomerId/convertedAt/convertedBy (the opportunity half of the
 *    conversion is written in step 05, once the opportunity exists);
 *  - direct customers, signed without ever being a lead.
 *
 * Most customers get a synthetic `keycloakId` — they exist as CRM records, not
 * portal logins. A small number get real Keycloak accounts so the customer
 * portal can actually be exercised.
 */
import { Types } from 'mongoose';
import {
  Customer,
  CustomerDocument,
} from '../../../src/customers/customer.schema';
import { User, UserDocument } from '../../../src/users/users.schema';
import { Lead, LeadDocument } from '../../../src/leads/lead.schema';
import { Contact, ContactDocument } from '../../../src/contacts/contact.schema';
import { AppRole } from '../../../src/users/app-role.enum';
import { EMAIL_DOMAIN, PORTAL_LOGIN_COUNT, VOLUMES } from '../config';
import { CustomerRef, model, SeedContext } from '../context';
import { SeedKeycloak } from '../keycloak';
import {
  between,
  chance,
  faker,
  int,
  momentAfter,
  NOW,
  pick,
  shuffle,
  weighted,
} from '../rng';

const CUSTOMER_NOTES = [
  'Migrated from a spreadsheet-based process during onboarding.',
  'Renewal is annual, invoiced in advance.',
  'Two sister companies share this contract.',
  'Prefers quarterly business reviews over monthly check-ins.',
  'Onboarding ran long — extra training sessions delivered.',
  'Strong reference customer, happy to take calls.',
];

const STATUS_MIX = [
  { value: 'active' as const, weight: 78 },
  { value: 'prospect' as const, weight: 14 },
  { value: 'inactive' as const, weight: 8 },
];

export async function seedCustomers(
  ctx: SeedContext,
  keycloak: SeedKeycloak,
): Promise<void> {
  const customerModel = model<CustomerDocument>(ctx.app, Customer.name);
  const userModel = model<UserDocument>(ctx.app, User.name);
  const leadModel = model<LeadDocument>(ctx.app, Lead.name);
  const contactModel = model<ContactDocument>(ctx.app, Contact.name);

  const convertedLeads = ctx.pools.leads.filter(
    (l) => l.status === 'converted',
  );
  const directCount = Math.max(0, VOLUMES.customers - convertedLeads.length);

  const takenEmails = new Set<string>();
  const customerDocs: Record<string, unknown>[] = [];
  const userDocs: Record<string, unknown>[] = [];
  const refs: CustomerRef[] = [];
  const leadUpdates: {
    updateOne: { filter: object; update: object };
  }[] = [];

  /** Which of the customers-to-be get a real portal login. */
  const portalSlots = new Set(
    shuffle(Array.from({ length: VOLUMES.customers }, (_, i) => i)).slice(
      0,
      PORTAL_LOGIN_COUNT,
    ),
  );

  const uniqueEmail = (candidate: string): string => {
    let email = candidate.toLowerCase();
    let n = 2;
    while (takenEmails.has(email)) {
      email = candidate.toLowerCase().replace('@', `${n}@`);
      n += 1;
    }
    takenEmails.add(email);
    return email;
  };

  let index = 0;

  const buildCustomer = async (opts: {
    firstName: string;
    lastName: string;
    email: string;
    company?: string;
    ownerId: string;
    teamId: Types.ObjectId;
    createdAt: Date;
    accountId?: Types.ObjectId;
  }): Promise<CustomerRef> => {
    const wantsPortalLogin = portalSlots.has(index);
    index += 1;

    const email = uniqueEmail(opts.email);
    // Portal customers need a real Keycloak account and a `Customer`-role
    // app user; the rest are CRM records only, with a synthetic subject id.
    const keycloakId = wantsPortalLogin
      ? await keycloak.provision({
          email,
          firstName: opts.firstName,
          lastName: opts.lastName,
        })
      : `seed-customer-${new Types.ObjectId().toHexString()}`;

    if (wantsPortalLogin) {
      userDocs.push({
        _id: new Types.ObjectId(),
        organizationId: ctx.organizationId,
        keycloakId,
        email,
        username: email,
        firstName: opts.firstName,
        lastName: opts.lastName,
        role: AppRole.Customer,
        createdAt: opts.createdAt,
        updatedAt: opts.createdAt,
      });
    }

    const id = new Types.ObjectId();
    customerDocs.push({
      _id: id,
      organizationId: ctx.organizationId,
      keycloakId,
      email,
      firstName: opts.firstName,
      lastName: opts.lastName,
      phone: faker.phone.number({ style: 'international' }),
      company: opts.company,
      address: `${faker.location.streetAddress()}, ${faker.location.city()}`,
      notes: chance(0.4) ? pick(CUSTOMER_NOTES) : undefined,
      status: weighted(STATUS_MIX),
      createdBy: opts.ownerId,
      assignedToId: opts.ownerId,
      assignedTeamId: opts.teamId,
      createdAt: opts.createdAt,
      updatedAt: between(opts.createdAt, NOW),
    });

    const ref: CustomerRef = {
      id,
      keycloakId,
      firstName: opts.firstName,
      lastName: opts.lastName,
      email,
      accountId: opts.accountId,
      ownerId: opts.ownerId,
      teamId: opts.teamId,
      createdAt: opts.createdAt,
    };
    refs.push(ref);
    return ref;
  };

  // ── Converted leads ─────────────────────────────────────────────────────
  for (const lead of convertedLeads) {
    // The conversion happens after the last engagement on the lead.
    const convertedAt = momentAfter(lead.createdAt, 0, 10);
    const customer = await buildCustomer({
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      ownerId: lead.ownerId,
      teamId: lead.teamId,
      createdAt: convertedAt > NOW ? lead.createdAt : convertedAt,
    });

    leadUpdates.push({
      updateOne: {
        filter: { _id: lead.id },
        update: {
          $set: {
            convertedCustomerId: customer.id,
            convertedAt: customer.createdAt,
            convertedBy: lead.ownerId,
          },
        },
      },
    });
  }

  // ── Direct customers ────────────────────────────────────────────────────
  // Drawn from existing contacts where possible, so the person's Contact and
  // Customer records are the same human and can be linked both ways.
  const linkableContacts = shuffle(ctx.pools.contacts).slice(0, directCount);
  const contactUpdates: { updateOne: { filter: object; update: object } }[] =
    [];

  for (let i = 0; i < directCount; i++) {
    const contact = linkableContacts[i];
    if (contact) {
      const account = ctx.pools.accounts.find((a) =>
        a.id.equals(contact.accountId),
      );
      const customer = await buildCustomer({
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        company: account?.name,
        ownerId: contact.ownerId,
        teamId: contact.teamId,
        createdAt: contact.createdAt,
        accountId: contact.accountId,
      });
      contactUpdates.push({
        updateOne: {
          filter: { _id: contact.id },
          update: { $set: { customerId: customer.id } },
        },
      });
    } else {
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const owner = pick(
        ctx.pools.staff.filter((s) => s.teamKind !== 'support'),
      );
      await buildCustomer({
        firstName,
        lastName,
        email:
          `${firstName}.${lastName}${int(1, 999)}@example.com`.toLowerCase(),
        ownerId: owner.keycloakId,
        teamId: owner.teamId,
        createdAt: between(ctx.pools.accounts[0]?.createdAt ?? NOW, NOW),
      });
    }
  }

  await ctx.insert('customers', customerModel, customerDocs);
  await ctx.insert('users', userModel, userDocs);

  // `timestamps: false` on the write-backs: stamping updatedAt = now would
  // make every converted lead look like it was touched during the seed.
  if (leadUpdates.length) {
    await leadModel.bulkWrite(leadUpdates, { timestamps: false });
  }
  if (contactUpdates.length) {
    await contactModel.bulkWrite(contactUpdates, {
      timestamps: false,
    });
  }

  ctx.pools.customers = refs;
  ctx.logger.log(
    `  ${refs.length} customers (${convertedLeads.length} from lead conversion, ` +
      `${PORTAL_LOGIN_COUNT} with portal logins @${EMAIL_DOMAIN})`,
  );
}
