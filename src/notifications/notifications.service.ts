import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Notification,
  NotificationDocument,
  NotificationEntityType,
  NotificationType,
} from './notification.schema';
import { NotificationResponseDto } from './dto/notification-response.dto';
import { toNotificationResponseDto } from './mappers/notification.mapper';

export interface CreateNotificationInput {
  organizationId: Types.ObjectId;
  /** keycloakId of who should receive this notification. */
  recipientId: string | null | undefined;
  /** keycloakId of who triggered it — skipped as a recipient so nobody is notified of their own action. */
  actorId?: string;
  type: NotificationType;
  title: string;
  body?: string;
  entityType: NotificationEntityType;
  entityId: Types.ObjectId | string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
  ) {}

  /**
   * Record one notification. Never throws — a failed notification write must
   * never break the operation that triggered it (same discipline as AuditService.log).
   */
  async notify(input: CreateNotificationInput): Promise<void> {
    if (!input.recipientId) return;
    if (input.actorId && input.actorId === input.recipientId) return;
    try {
      await this.notificationModel.create({
        organizationId: input.organizationId,
        recipientId: input.recipientId,
        type: input.type,
        title: input.title,
        body: input.body,
        entityType: input.entityType,
        entityId: input.entityId,
      });
    } catch (error) {
      this.logger.error(
        `Failed to write notification (${input.type} ${input.entityType} ${input.entityId.toString()}):`,
        error,
      );
    }
  }

  async findForUser(
    recipientId: string,
    organizationId: Types.ObjectId,
    options: { unreadOnly?: boolean; limit?: number },
  ): Promise<NotificationResponseDto[]> {
    const filter: Record<string, unknown> = { organizationId, recipientId };
    if (options.unreadOnly) filter.isRead = false;
    const notifications = await this.notificationModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(options.limit ?? 20)
      .exec();
    return notifications.map(toNotificationResponseDto);
  }

  async unreadCount(
    recipientId: string,
    organizationId: Types.ObjectId,
  ): Promise<number> {
    return this.notificationModel
      .countDocuments({ organizationId, recipientId, isRead: false })
      .exec();
  }

  async markRead(
    id: string,
    recipientId: string,
    organizationId: Types.ObjectId,
  ): Promise<void> {
    await this.notificationModel
      .updateOne({ _id: id, recipientId, organizationId }, { isRead: true })
      .exec();
  }

  async markAllRead(
    recipientId: string,
    organizationId: Types.ObjectId,
  ): Promise<void> {
    await this.notificationModel
      .updateMany(
        { organizationId, recipientId, isRead: false },
        { isRead: true },
      )
      .exec();
  }
}
