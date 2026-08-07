import { NotificationDocument } from '../notification.schema';
import { NotificationResponseDto } from '../dto/notification-response.dto';

export function toNotificationResponseDto(
  notification: NotificationDocument,
): NotificationResponseDto {
  return {
    id: notification._id.toString(),
    type: notification.type,
    title: notification.title,
    body: notification.body,
    entityType: notification.entityType,
    entityId: notification.entityId.toString(),
    isRead: notification.isRead,
    createdAt:
      notification.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}
