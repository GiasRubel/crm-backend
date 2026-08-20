import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createE2eApp, signTestJwt } from './utils/e2e-app';
import {
  clearDatabase,
  dropTestDatabase,
  seedCustomer,
  seedOrganization,
  seedTeam,
  seedUser,
} from './utils/db';
import { AppRole } from '../src/users/app-role.enum';

/** The subset of StaffUserResponseDto these assertions read. */
interface StaffRow {
  email: string;
  keycloakId: string;
}

function staffRows(body: unknown): StaffRow[] {
  return body as StaffRow[];
}

/**
 * End-to-end cover for the tenancy defects fixed in the pre-release security
 * pass (C2 and C3 in CRM-RELEASE-REVIEW.md). These run through the real guard
 * chain against real Mongo data, so they fail if any of the org-scoping
 * arguments threaded through the service layer is dropped again.
 */
describe('Tenant isolation (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    ({ app } = await createE2eApp());
  });

  afterEach(async () => {
    await clearDatabase(app);
  });

  afterAll(async () => {
    await dropTestDatabase(app);
    await app.close();
  });

  /** Two organisations, each with one Admin, plus signed tokens for both. */
  async function seedTwoOrgs() {
    const orgA = await seedOrganization(app);
    const orgB = await seedOrganization(app);
    const adminA = await seedUser(app, orgA._id, AppRole.Admin, {
      email: 'admin-a@orga.example',
      firstName: 'Alice',
      lastName: 'OrgA',
    });
    const adminB = await seedUser(app, orgB._id, AppRole.Admin, {
      email: 'admin-b@orgb.example',
      firstName: 'Bob',
      lastName: 'OrgB',
    });
    return {
      orgA,
      orgB,
      adminA,
      adminB,
      tokenA: signTestJwt({ sub: adminA.keycloakId }),
      tokenB: signTestJwt({ sub: adminB.keycloakId }),
    };
  }

  describe('C2 — GET /users/staff must not leak the other tenant', () => {
    it('returns only the caller organization staff', async () => {
      const { adminA, adminB, tokenA } = await seedTwoOrgs();

      const res = await request(app.getHttpServer())
        .get('/users/staff')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      const rows = staffRows(res.body);
      const emails = rows.map((u) => u.email);
      expect(emails).toContain(adminA.email);
      expect(emails).not.toContain(adminB.email);
      expect(rows).toHaveLength(1);
    });

    it('never exposes another tenant keycloakId, the join key for assignments', async () => {
      const { adminB, tokenA } = await seedTwoOrgs();

      const res = await request(app.getHttpServer())
        .get('/users/staff')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      const ids = staffRows(res.body).map((u) => u.keycloakId);
      expect(ids).not.toContain(adminB.keycloakId);
    });

    it('gives each tenant a directory of exactly their own staff', async () => {
      const { orgA, adminA, adminB, tokenA, tokenB } = await seedTwoOrgs();
      await seedUser(app, orgA._id, AppRole.User, {
        email: 'rep-a@orga.example',
      });

      const [resA, resB] = await Promise.all([
        request(app.getHttpServer())
          .get('/users/staff')
          .set('Authorization', `Bearer ${tokenA}`)
          .expect(200),
        request(app.getHttpServer())
          .get('/users/staff')
          .set('Authorization', `Bearer ${tokenB}`)
          .expect(200),
      ]);

      expect(
        staffRows(resA.body)
          .map((u) => u.email)
          .sort(),
      ).toEqual([adminA.email, 'rep-a@orga.example']);
      expect(staffRows(resB.body).map((u) => u.email)).toEqual([adminB.email]);
    });
  });

  describe('C3 — foreign keys must not cross the tenant boundary', () => {
    it('refuses a ticket referencing another tenant customer', async () => {
      const { orgB, adminB, tokenA } = await seedTwoOrgs();
      const foreignCustomer = await seedCustomer(
        app,
        orgB._id,
        adminB.keycloakId,
        { firstName: 'Carol', lastName: 'Foreign' },
      );

      const res = await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          subject: 'Cross-tenant probe',
          description: 'Should be rejected',
          customerId: foreignCustomer._id.toString(),
        })
        .expect(400);

      // The old behaviour accepted this and denormalised org B's customer name
      // into the response — the leak, not just the bad write.
      expect(JSON.stringify(res.body)).not.toContain('Carol');
      expect(JSON.stringify(res.body)).not.toContain('Foreign');
    });

    it('refuses an opportunity referencing another tenant customer', async () => {
      const { orgA, orgB, adminA, adminB, tokenA } = await seedTwoOrgs();
      const ownCustomer = await seedCustomer(app, orgA._id, adminA.keycloakId, {
        firstName: 'Dana',
        lastName: 'Own',
      });
      const foreignCustomer = await seedCustomer(
        app,
        orgB._id,
        adminB.keycloakId,
        { firstName: 'Erin', lastName: 'Foreign' },
      );

      // Control: the same request against their own customer succeeds, so the
      // rejection below is about tenancy and not about the payload.
      await request(app.getHttpServer())
        .post('/opportunities')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: 'Own deal',
          customerId: ownCustomer._id.toString(),
          amount: 1000,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/opportunities')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: 'Cross-tenant deal',
          customerId: foreignCustomer._id.toString(),
          amount: 1000,
        })
        .expect(400);
    });

    it('refuses to assign a record to another tenant staff member', async () => {
      const { orgA, adminA, adminB, tokenA } = await seedTwoOrgs();
      const customer = await seedCustomer(app, orgA._id, adminA.keycloakId, {
        firstName: 'Finn',
        lastName: 'Own',
      });

      await request(app.getHttpServer())
        .patch(`/customers/${customer._id.toString()}/assign`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ assignedToId: adminB.keycloakId })
        .expect(400);
    });

    it('refuses to route a record to another tenant team', async () => {
      const { orgA, orgB, adminA, adminB, tokenA } = await seedTwoOrgs();
      const foreignTeam = await seedTeam(app, orgB._id, adminB.keycloakId, {
        name: 'Org B Team',
      });
      const customer = await seedCustomer(app, orgA._id, adminA.keycloakId, {
        firstName: 'Gale',
        lastName: 'Own',
      });

      await request(app.getHttpServer())
        .patch(`/customers/${customer._id.toString()}/assign`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ assignedTeamId: foreignTeam._id.toString() })
        .expect(400);
    });

    it('refuses to add another tenant staff member to a team', async () => {
      const { adminB, tokenA } = await seedTwoOrgs();

      await request(app.getHttpServer())
        .post('/teams')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Infiltrated Team', memberIds: [adminB.keycloakId] })
        .expect(400);
    });
  });

  describe('public knowledge base is scoped per organisation', () => {
    it('requires an organizationSlug', async () => {
      await request(app.getHttpServer()).get('/kb/public').expect(400);
    });

    it('does not reveal whether an organisation slug exists', async () => {
      const { orgA } = await seedTwoOrgs();

      const [unknown, known] = await Promise.all([
        request(app.getHttpServer())
          .get('/kb/public/some-article?organizationSlug=no-such-org')
          .expect(404),
        request(app.getHttpServer())
          .get(`/kb/public/some-article?organizationSlug=${orgA.slug}`)
          .expect(404),
      ]);

      const messageOf = (body: unknown) =>
        (body as { message: string }).message;
      expect(messageOf(unknown.body)).toBe(messageOf(known.body));
    });
  });
});
