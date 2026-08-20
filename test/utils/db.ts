import { INestApplication } from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { Organization } from '../../src/organizations/organization.schema';
import { User } from '../../src/users/users.schema';
import { AppRole } from '../../src/users/app-role.enum';
import { Customer } from '../../src/customers/customer.schema';
import { Team } from '../../src/teams/team.schema';

export function getTestConnection(app: INestApplication): Connection {
  return app.get<Connection>(getConnectionToken());
}

/** Wipes every collection in the dedicated e2e test database. Safe to call
 * before/after each spec — this database is never used outside the e2e suite. */
export async function clearDatabase(app: INestApplication): Promise<void> {
  const connection = getTestConnection(app);
  const collections = await connection.db!.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

export async function dropTestDatabase(app: INestApplication): Promise<void> {
  await getTestConnection(app).db!.dropDatabase();
}

let orgSlugCounter = 0;

export async function seedOrganization(
  app: INestApplication,
  overrides: Partial<Organization> = {},
): Promise<Organization & { _id: Types.ObjectId }> {
  const model = app.get<Model<Organization>>(getModelToken(Organization.name));
  orgSlugCounter += 1;
  const doc = await model.create({
    name: overrides.name ?? `Test Org ${orgSlugCounter}`,
    slug: overrides.slug ?? `test-org-${orgSlugCounter}`,
    status: overrides.status ?? 'active',
    authProvider: overrides.authProvider ?? 'keycloak',
  });
  return doc.toObject();
}

let keycloakIdCounter = 0;

export async function seedUser(
  app: INestApplication,
  organizationId: Types.ObjectId,
  role: AppRole,
  overrides: Partial<User> = {},
): Promise<User & { _id: Types.ObjectId }> {
  const model = app.get<Model<User>>(getModelToken(User.name));
  keycloakIdCounter += 1;
  const doc = await model.create({
    organizationId,
    keycloakId: overrides.keycloakId ?? `kc-e2e-${keycloakIdCounter}`,
    email: overrides.email ?? `e2e-user-${keycloakIdCounter}@example.com`,
    username: overrides.username ?? `e2e-user-${keycloakIdCounter}`,
    firstName: overrides.firstName ?? 'Test',
    lastName: overrides.lastName ?? 'User',
    role,
    passwordHash: overrides.passwordHash,
    tokenVersion: overrides.tokenVersion ?? 0,
  });
  return doc.toObject();
}

let customerCounter = 0;

/** A customer in `organizationId`, with every schema-required field filled. */
export async function seedCustomer(
  app: INestApplication,
  organizationId: Types.ObjectId,
  createdBy: string,
  overrides: Partial<Customer> = {},
): Promise<Customer & { _id: Types.ObjectId }> {
  const model = app.get<Model<Customer>>(getModelToken(Customer.name));
  customerCounter += 1;
  const doc = await model.create({
    organizationId,
    keycloakId: overrides.keycloakId ?? `kc-e2e-customer-${customerCounter}`,
    email: overrides.email ?? `e2e-customer-${customerCounter}@example.com`,
    firstName: overrides.firstName ?? 'Test',
    lastName: overrides.lastName ?? `Customer${customerCounter}`,
    phone: overrides.phone ?? '+15550000000',
    status: overrides.status ?? 'active',
    createdBy,
    assignedToId: overrides.assignedToId,
    assignedTeamId: overrides.assignedTeamId,
  });
  return doc.toObject();
}

let teamCounter = 0;

/** A team in `organizationId`, with every schema-required field filled. */
export async function seedTeam(
  app: INestApplication,
  organizationId: Types.ObjectId,
  createdBy: string,
  overrides: Partial<Team> = {},
): Promise<Team & { _id: Types.ObjectId }> {
  const model = app.get<Model<Team>>(getModelToken(Team.name));
  teamCounter += 1;
  const doc = await model.create({
    organizationId,
    name: overrides.name ?? `E2E Team ${teamCounter}`,
    isActive: overrides.isActive ?? true,
    memberIds: overrides.memberIds ?? [],
    leaderId: overrides.leaderId,
    regions: overrides.regions ?? [],
    createdBy,
  });
  return doc.toObject();
}
