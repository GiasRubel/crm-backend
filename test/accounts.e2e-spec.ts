import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createE2eApp, signTestJwt } from './utils/e2e-app';
import {
  clearDatabase,
  dropTestDatabase,
  seedOrganization,
  seedUser,
} from './utils/db';
import { AppRole } from '../src/users/app-role.enum';

describe('Accounts (e2e)', () => {
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

  it('rejects a request with no bearer token', async () => {
    await request(app.getHttpServer()).get('/accounts').expect(401);
  });

  it('rejects a request with a malformed bearer token', async () => {
    await request(app.getHttpServer())
      .get('/accounts')
      .set('Authorization', 'Bearer not-a-real-jwt')
      .expect(401);
  });

  it('lets a User-role staff member create and read back an account in their org', async () => {
    const org = await seedOrganization(app);
    const staff = await seedUser(app, org._id, AppRole.User);
    const token = signTestJwt({ sub: staff.keycloakId });

    const createRes = await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Acme Corp' })
      .expect(201);

    expect(createRes.body).toMatchObject({
      name: 'Acme Corp',
      status: 'prospect',
    });
    expect(createRes.body).not.toHaveProperty('organizationId');

    const listRes = await request(app.getHttpServer())
      .get('/accounts')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0].id).toBe(createRes.body.id);
  });

  it('rejects a request with an invalid body with 400', async () => {
    const org = await seedOrganization(app);
    const staff = await seedUser(app, org._id, AppRole.User);
    const token = signTestJwt({ sub: staff.keycloakId });

    await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '' })
      .expect(400);
  });

  it('scopes accounts to the caller organization — a peer org sees nothing', async () => {
    const orgA = await seedOrganization(app);
    const orgB = await seedOrganization(app);
    const staffA = await seedUser(app, orgA._id, AppRole.User);
    const staffB = await seedUser(app, orgB._id, AppRole.User);
    const tokenA = signTestJwt({ sub: staffA.keycloakId });
    const tokenB = signTestJwt({ sub: staffB.keycloakId });

    await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Org A Account' })
      .expect(201);

    const listRes = await request(app.getHttpServer())
      .get('/accounts')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    expect(listRes.body.data).toHaveLength(0);
  });

  it('forbids a User-role staff member from deleting an account (Admin/Administrator only)', async () => {
    const org = await seedOrganization(app);
    const staff = await seedUser(app, org._id, AppRole.User);
    const token = signTestJwt({ sub: staff.keycloakId });

    const createRes = await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Acme Corp' })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/accounts/${createRes.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('allows an Admin to delete an account', async () => {
    const org = await seedOrganization(app);
    const admin = await seedUser(app, org._id, AppRole.Admin);
    const token = signTestJwt({ sub: admin.keycloakId });

    const createRes = await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Acme Corp' })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/accounts/${createRes.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/accounts/${createRes.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('rejects a caller whose Keycloak subject has no app user record yet', async () => {
    const token = signTestJwt({ sub: 'unknown-keycloak-subject' });

    await request(app.getHttpServer())
      .get('/accounts')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });
});
