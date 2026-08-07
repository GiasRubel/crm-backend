import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { Model } from 'mongoose';
import { createE2eApp } from './utils/e2e-app';
import { clearDatabase, dropTestDatabase, seedOrganization } from './utils/db';
import { Lead } from '../src/leads/lead.schema';

describe('Leads capture (e2e)', () => {
  let app: INestApplication<App>;
  let leadModel: Model<Lead>;

  beforeAll(async () => {
    ({ app } = await createE2eApp());
    leadModel = app.get<Model<Lead>>(getModelToken(Lead.name));
  });

  afterEach(async () => {
    await clearDatabase(app);
  });

  afterAll(async () => {
    await dropTestDatabase(app);
    await app.close();
  });

  it('202s and persists a new lead for a known organization slug', async () => {
    const org = await seedOrganization(app, { slug: 'acme' });

    await request(app.getHttpServer())
      .post('/leads/capture')
      .send({
        organizationSlug: 'acme',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'Jane.Doe@Example.com',
        source: 'web_form',
      })
      .expect(202);

    const leads = await leadModel.find({ organizationId: org._id }).exec();
    expect(leads).toHaveLength(1);
    expect(leads[0].email).toBe('jane.doe@example.com');
    expect(leads[0].engagements).toHaveLength(1);
  });

  it('202s but discards the submission for an unknown organization slug', async () => {
    await request(app.getHttpServer())
      .post('/leads/capture')
      .send({
        organizationSlug: 'does-not-exist',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
      })
      .expect(202);

    expect(await leadModel.countDocuments()).toBe(0);
  });

  it('202s but discards the submission when the honeypot field is filled', async () => {
    await seedOrganization(app, { slug: 'acme' });

    await request(app.getHttpServer())
      .post('/leads/capture')
      .send({
        organizationSlug: 'acme',
        firstName: 'Bot',
        lastName: 'Submission',
        email: 'bot@example.com',
        website: 'http://spam.example',
      })
      .expect(202);

    expect(await leadModel.countDocuments()).toBe(0);
  });

  it('rejects an invalid payload with 400 before it reaches the service', async () => {
    await request(app.getHttpServer())
      .post('/leads/capture')
      .send({
        organizationSlug: 'acme',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'not-an-email',
      })
      .expect(400);

    expect(await leadModel.countDocuments()).toBe(0);
  });

  it('merges a second open submission from the same email into the existing lead', async () => {
    const org = await seedOrganization(app, { slug: 'acme' });

    const capture = () =>
      request(app.getHttpServer()).post('/leads/capture').send({
        organizationSlug: 'acme',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
      });

    await capture().expect(202);
    await capture().expect(202);

    const leads = await leadModel.find({ organizationId: org._id }).exec();
    expect(leads).toHaveLength(1);
    expect(leads[0].engagements).toHaveLength(2);
  });
});
