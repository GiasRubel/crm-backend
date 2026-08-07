import type {
  NotificationEntityType,
  NotificationType,
} from '../notification.schema';

export class NotificationResponseDto {
  id: string;
  type: NotificationType;
  title: string;
  body?: string;
  entityType: NotificationEntityType;
  entityId: string;
  isRead: boolean;
  createdAt: string;
}
