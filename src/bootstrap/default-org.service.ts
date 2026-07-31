import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Organization,
  OrganizationDocument,
} from '../organizations/organization.schema';
import {
  Subscription,
  SubscriptionDocument,
} from '../subscriptions/subscription.schema';
import { DeploymentMode, getDeploymentMode } from '../config/deployment-mode';

const DEFAULT_ORG_SLUG = 'default';
const DEFAULT_ORG_NAME = 'My Company';

/**
 * Standalone (Regular License) deployments are single-tenant: there is no
 * provisioning flow to create an Organization, so one is created on first
 * boot and every user is attached to it. Idempotent — safe across restarts.
 */
@Injectable()
export class DefaultOrgService implements OnModuleInit {
  private readonly logger = new Logger(DefaultOrgService.name);
  private cachedOrgId: Types.ObjectId | null = null;

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(Organization.name)
    private readonly organizationModel: Model<OrganizationDocument>,
    @InjectModel(Subscription.name)
    private readonly subscriptionModel: Model<SubscriptionDocument>,
  ) {}

  async onModuleInit(): Promise<void> {
    if (getDeploymentMode(this.configService) !== DeploymentMode.Standalone) {
      return;
    }
    await this.getDefaultOrganizationId();
  }

  /** Returns the single default org id, creating it (+ an active subscription) if needed. */
  async getDefaultOrganizationId(): Promise<Types.ObjectId> {
    if (this.cachedOrgId) {
      return this.cachedOrgId;
    }

    let organization = await this.organizationModel
      .findOne({ slug: DEFAULT_ORG_SLUG })
      .exec();

    if (!organization) {
      organization = await this.organizationModel.create({
        name: DEFAULT_ORG_NAME,
        slug: DEFAULT_ORG_SLUG,
        status: 'active',
      });
      this.logger.log(
        `Created default organization: ${organization._id.toString()}`,
      );
    }

    const hasSubscription = await this.subscriptionModel.exists({
      organizationId: organization._id,
    });

    if (!hasSubscription) {
      await this.subscriptionModel.create({
        organizationId: organization._id,
        stripeCustomerId: 'standalone-no-stripe-customer',
        status: 'active',
      });
      this.logger.log(
        `Created default subscription for org ${organization._id.toString()}`,
      );
    }

    this.cachedOrgId = organization._id;
    return this.cachedOrgId;
  }
}
