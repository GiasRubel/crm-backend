import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../src/app.module';
import { User } from '../src/users/users.schema';
import { Organization } from '../src/organizations/organization.schema';
import { Subscription } from '../src/subscriptions/subscription.schema';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const userModel = app.get<Model<any>>(getModelToken(User.name));
    const orgModel = app.get<Model<any>>(getModelToken(Organization.name));
    const subModel = app.get<Model<any>>(getModelToken(Subscription.name));

    const users = await userModel.find().exec();
    const orgs = await orgModel.find().exec();
    const subs = await subModel.find().exec();

    console.log('\n--- ORGANIZATIONS ---');
    orgs.forEach((org) => {
      const sub = subs.find((s) => s.organizationId.toString() === org._id.toString());
      console.log(`Org Name: ${org.name} | Slug: ${org.slug} | Status: ${org.status}`);
      if (sub) {
        console.log(`  └─ Subscription: Status: ${sub.status} | Stripe Customer: ${sub.stripeCustomerId}`);
      } else {
        console.log(`  └─ Subscription: NONE`);
      }
    });

    console.log('\n--- USERS ---');
    users.forEach((user) => {
      const org = orgs.find((o) => o._id.toString() === user.organizationId?.toString());
      console.log(`Email: ${user.email} | Role: ${user.role} | Org: ${org ? org.name : 'PlatformAdmin / None'}`);
    });
    console.log('');
  } finally {
    await app.close();
  }
}

run().catch((err) => {
  console.error('List users failed:', err);
  process.exit(1);
});
