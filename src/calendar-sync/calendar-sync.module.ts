import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Activity, ActivitySchema } from '../activities/activity.schema';
import {
  CalendarConnection,
  CalendarConnectionSchema,
} from './calendar-connection.schema';
import {
  CalendarOauthState,
  CalendarOauthStateSchema,
} from './calendar-oauth-state.schema';
import { CalendarSyncController } from './calendar-sync.controller';
import { CalendarSyncCron } from './calendar-sync.cron';
import { CalendarSyncService } from './calendar-sync.service';
import { GoogleCalendarProvider } from './providers/google-calendar.provider';
import { MicrosoftCalendarProvider } from './providers/microsoft-calendar.provider';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CalendarConnection.name, schema: CalendarConnectionSchema },
      { name: CalendarOauthState.name, schema: CalendarOauthStateSchema },
      // Registered directly (ActivitiesModule precedent) rather than
      // importing ActivitiesModule — ActivitiesModule imports this module
      // for the push side-effect, so importing it back would cycle.
      { name: Activity.name, schema: ActivitySchema },
    ]),
  ],
  controllers: [CalendarSyncController],
  providers: [
    CalendarSyncService,
    CalendarSyncCron,
    GoogleCalendarProvider,
    MicrosoftCalendarProvider,
  ],
  exports: [CalendarSyncService],
})
export class CalendarSyncModule {}
