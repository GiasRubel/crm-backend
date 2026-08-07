import { INestApplication } from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { Organization } from '../../src/organizations/organization.schema';
import { User } from '../../src/users/users.schema';
import { AppRole } from '../../src/users/app-role.enum';

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
  });
  return doc.toObject();
}
