import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { SubscriptionResponseDto } from './dto/subscription-response.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { toSubscriptionResponseDto } from './mappers/subscription.mapper';
import {
  Subscription,
  SubscriptionDocument,
  SubscriptionStatus,
} from './subscription.schema';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    @InjectModel(Subscription.name)
    private readonly subscriptionModel: Model<SubscriptionDocument>,
  ) {}

  async create(dto: CreateSubscriptionDto): Promise<SubscriptionResponseDto> {
    const existing = await this.subscriptionModel
      .findOne({ organizationId: new Types.ObjectId(dto.organizationId) })
      .exec();
    if (existing) {
      throw new ConflictException(
        'This organization already has a subscription',
      );
    }

    const subscription = await this.subscriptionModel.create({
      organizationId: new Types.ObjectId(dto.organizationId),
      stripeCustomerId: dto.stripeCustomerId,
      stripeSubscriptionId: dto.stripeSubscriptionId,
      planId: dto.planId,
      status: dto.status ?? 'incomplete',
      currentPeriodEnd: dto.currentPeriodEnd,
    });

    this.logger.log(
      `Subscription created for org ${dto.organizationId}: ${subscription._id.toString()}`,
    );
    return toSubscriptionResponseDto(subscription);
  }

  async findByOrganizationId(
    organizationId: string,
  ): Promise<SubscriptionResponseDto> {
    const subscription = await this.findByOrgOrThrow(organizationId);
    return toSubscriptionResponseDto(subscription);
  }

  async update(
    organizationId: string,
    dto: UpdateSubscriptionDto,
  ): Promise<SubscriptionResponseDto> {
    const subscription = await this.findByOrgOrThrow(organizationId);

    if (dto.stripeCustomerId !== undefined)
      subscription.stripeCustomerId = dto.stripeCustomerId;
    if (dto.stripeSubscriptionId !== undefined)
      subscription.stripeSubscriptionId = dto.stripeSubscriptionId;
    if (dto.planId !== undefined) subscription.planId = dto.planId;
    if (dto.status !== undefined) subscription.status = dto.status;
    if (dto.currentPeriodEnd !== undefined)
      subscription.currentPeriodEnd = dto.currentPeriodEnd;

    await subscription.save();
    return toSubscriptionResponseDto(subscription);
  }

  /** Used internally by guards — returns the raw document, not a DTO. */
  async findDocByOrganizationId(
    organizationId: Types.ObjectId,
  ): Promise<SubscriptionDocument | null> {
    return this.subscriptionModel.findOne({ organizationId }).exec();
  }

  async deleteByOrganizationId(organizationId: string): Promise<void> {
    await this.subscriptionModel
      .deleteOne({ organizationId: new Types.ObjectId(organizationId) })
      .exec();
  }

  async updateByStripeSubscriptionId(
    stripeSubscriptionId: string,
    updates: {
      status?: SubscriptionStatus;
      currentPeriodEnd?: Date;
      planId?: string;
    },
  ): Promise<void> {
    const sub = await this.subscriptionModel
      .findOne({ stripeSubscriptionId })
      .exec();
    if (!sub) {
      this.logger.warn(
        `Subscription not found for stripeSubscriptionId: ${stripeSubscriptionId}`,
      );
      return;
    }
    if (updates.status !== undefined) sub.status = updates.status;
    if (updates.currentPeriodEnd !== undefined)
      sub.currentPeriodEnd = updates.currentPeriodEnd;
    if (updates.planId !== undefined) sub.planId = updates.planId;
    await sub.save();
    this.logger.log(
      `Subscription updated via webhook for stripeSubscriptionId ${stripeSubscriptionId}: status=${sub.status}`,
    );
  }

  private async findByOrgOrThrow(
    organizationId: string,
  ): Promise<SubscriptionDocument> {
    if (!isValidObjectId(organizationId)) {
      throw new NotFoundException('Subscription not found');
    }
    const subscription = await this.subscriptionModel
      .findOne({ organizationId: new Types.ObjectId(organizationId) })
      .exec();
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }
    return subscription;
  }
}
