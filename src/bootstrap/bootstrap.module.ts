import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Organization,
  OrganizationSchema,
} from '../organizations/organization.schema';
import {
  Subscription,
  SubscriptionSchema,
} from '../subscriptions/subscription.schema';
import { DefaultOrgService } from './default-org.service';

/**
 * Registers the Organization/Subscription schemas directly (read/write-minimal)
 * instead of importing OrganizationsModule/SubscriptionsModule, which would
 * create a dependency cycle back through UsersModule.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Organization.name, schema: OrganizationSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
    ]),
  ],
  providers: [DefaultOrgService],
  exports: [DefaultOrgService],
})
export class BootstrapModule {}
