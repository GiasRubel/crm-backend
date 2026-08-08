import { CalendarConnectionDocument } from '../calendar-connection.schema';
import { CalendarConnectionResponseDto } from '../dto/calendar-connection-response.dto';

export function toCalendarConnectionResponseDto(
  connection: CalendarConnectionDocument,
): CalendarConnectionResponseDto {
  return {
    id: connection._id.toString(),
    provider: connection.provider,
    providerAccountEmail: connection.providerAccountEmail,
    status: connection.status,
    lastError: connection.lastError,
    lastSyncedAt: connection.lastSyncedAt,
    createdAt: connection.createdAt,
  };
}
