import {
  CalendarConnectionStatus,
  CalendarProvider,
} from '../calendar-connection.schema';

export class CalendarConnectionResponseDto {
  id: string;
  provider: CalendarProvider;
  providerAccountEmail?: string;
  status: CalendarConnectionStatus;
  lastError?: string;
  lastSyncedAt?: Date;
  createdAt?: Date;
}
