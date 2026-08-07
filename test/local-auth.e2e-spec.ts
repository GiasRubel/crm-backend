import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcryptjs';
import { createE2eApp, signTestJwt } from './utils/e2e-app';
import { clearDatabase, dropTestDatabase, seedOrganization, seedUser } from './utils/db';
import { AppRole } from '../src/users/app-role.enum';
import { User } from '../src/users/users.schema';

describe('Local auth (e2e)', () => {
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

  it('logs in a local-auth org user and reaches a protected route with the returned token', async () => {
    const org = await seedOrganization(app, { authProvider: 'local' });
    const passwordHash = await bcrypt.hash('correct-password', 12);
    const user = await seedUser(app, org._id, AppRole.User, {
      email: 'local-user@example.com',
      passwordHash,
    });

    const loginRes = await request(app.getHttpServer())
      .post('/auth/local/login')
      .send({ email: user.email, password: 'correct-password' })
      .expect(200);

    expect(loginRes.body).toHaveProperty('accessToken');
    expect(loginRes.body).toHaveProperty('refreshToken');

    const meRes = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .expect(200);

    expect(meRes.body.email).toBe(user.email);
  });

  it('rejects a wrong password', async () => {
    const org = await seedOrganization(app, { authProvider: 'local' });
    const passwordHash = await bcrypt.hash('correct-password', 12);
    const user = await seedUser(app, org._id, AppRole.User, {
      email: 'wrong-pw@example.com',
      passwordHash,
    });

    await request(app.getHttpServer())
      .post('/auth/local/login')
      .send({ email: user.email, password: 'nope' })
      .expect(401);
  });

  it("rejects login for a user whose org uses Keycloak SSO, even with the right password", async () => {
    const org = await seedOrganization(app, { authProvider: 'keycloak' });
    const passwordHash = await bcrypt.hash('correct-password', 12);
    const user = await seedUser(app, org._id, AppRole.User, {
      email: 'sso-user@example.com',
      passwordHash,
    });

    await request(app.getHttpServer())
      .post('/auth/local/login')
      .send({ email: user.email, password: 'correct-password' })
      .expect(401);
  });

  it('refreshes an access token, then rejects the old refresh token once tokenVersion is bumped (password change)', async () => {
    const org = await seedOrganization(app, { authProvider: 'local' });
    const passwordHash = await bcrypt.hash('correct-password', 12);
    const user = await seedUser(app, org._id, AppRole.User, {
      email: 'refresh-user@example.com',
      passwordHash,
    });

    const loginRes = await request(app.getHttpServer())
      .post('/auth/local/login')
      .send({ email: user.email, password: 'correct-password' })
      .expect(200);

    const refreshRes = await request(app.getHttpServer())
      .post('/auth/local/refresh')
      .send({ refreshToken: loginRes.body.refreshToken })
      .expect(200);
    expect(refreshRes.body).toHaveProperty('accessToken');

    // Simulate what LocalAuthService.setPassword does on a real password
    // change — bump tokenVersion, which must invalidate every refresh token
    // issued before it.
    const userModel = app.get<Model<User>>(getModelToken(User.name));
    await userModel.updateOne({ email: user.email }, { $inc: { tokenVersion: 1 } });

    await request(app.getHttpServer())
      .post('/auth/local/refresh')
      .send({ refreshToken: refreshRes.body.refreshToken })
      .expect(401);
  });

  it('resolves the auth provider for a known local user and defaults to keycloak for an unknown email', async () => {
    const org = await seedOrganization(app, { authProvider: 'local' });
    const user = await seedUser(app, org._id, AppRole.User, {
      email: 'resolve-user@example.com',
      passwordHash: await bcrypt.hash('x', 12),
    });

    const known = await request(app.getHttpServer())
      .post('/auth/local/resolve')
      .send({ email: user.email })
      .expect(200);
    expect(known.body).toEqual({ authProvider: 'local' });

    const unknown = await request(app.getHttpServer())
      .post('/auth/local/resolve')
      .send({ email: 'nobody@example.com' })
      .expect(200);
    expect(unknown.body).toEqual({ authProvider: 'keycloak' });
  });

  it('keeps rejecting a local-auth login attempt against a Keycloak-issued JWT route unaffected — SSO users still authenticate normally', async () => {
    const org = await seedOrganization(app, { authProvider: 'keycloak' });
    const staff = await seedUser(app, org._id, AppRole.User);
    const token = signTestJwt({ sub: staff.keycloakId, email: staff.email });

    await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });
});
