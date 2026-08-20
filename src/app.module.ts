import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { MailModule } from './mail/mail.module';
import { MailSettingsModule } from './mail-settings/mail-settings.module';
import { KeycloakAdminModule } from './keycloak-admin/keycloak-admin.module';
import { PasswordModule } from './auth/password/password.module';
import { CustomersModule } from './customers/customers.module';
import { TeamsModule } from './teams/teams.module';
import { LeadsModule } from './leads/leads.module';
import { OpportunitiesModule } from './opportunities/opportunities.module';
import { AccountsModule } from './accounts/accounts.module';
import { ContactsModule } from './contacts/contacts.module';
import { ActivitiesModule } from './activities/activities.module';
import { CalendarSyncModule } from './calendar-sync/calendar-sync.module';
import { EventsModule } from './events/events.module';
import { AutomationsModule } from './automations/automations.module';
import { KbModule } from './kb/kb.module';
import { TicketsModule } from './tickets/tickets.module';
import { ReportsModule } from './reports/reports.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { LicensingModule } from './licensing/licensing.module';
import { AuditModule } from './audit/audit.module';
import { CustomFieldsModule } from './custom-fields/custom-fields.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SearchModule } from './search/search.module';
import { RolesModule } from './roles/roles.module';
import { validateEnv } from './config/env-validation';
import { THROTTLE_BUCKETS } from './config/throttle';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // Named buckets so a route can opt into a tighter limit with @Throttle;
    // see config/throttle.ts. The default bucket applies to everything else.
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ...THROTTLE_BUCKETS.default }],
      // e2e specs make far more requests than a human would, and several
      // deliberately retry a login. Gated on NODE_ENV==='test' as well as the
      // flag, so setting THROTTLE_DISABLED in a real deployment does nothing —
      // an env var must not be able to switch off a security control.
      skipIf: () =>
        process.env.NODE_ENV === 'test' &&
        process.env.THROTTLE_DISABLED === 'true',
    }),
    ScheduleModule.forRoot(),
    MongooseModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('MONGO_URI'),
      }),
      inject: [ConfigService],
    }),
    KeycloakAdminModule, // Global — available to all modules
    EventsModule, // Global — CrmEventBus injectable everywhere
    AuditModule, // Global — AuditService injectable everywhere
    CustomFieldsModule, // Global — CustomFieldsService injectable everywhere
    AttachmentsModule, // Global — AttachmentsService injectable everywhere
    NotificationsModule, // Global — NotificationsService injectable everywhere
    RolesModule, // Global — PermissionsService/CustomRolesService injectable everywhere
    LicensingModule, // Must run before AuthModule: gates the whole API on activation
    AuthModule,
    UsersModule,
    OrganizationsModule,
    SubscriptionsModule,
    MailModule,
    MailSettingsModule,
    PasswordModule,
    TeamsModule,
    CustomersModule,
    AccountsModule,
    ContactsModule,
    OpportunitiesModule,
    LeadsModule,
    ActivitiesModule,
    CalendarSyncModule,
    KbModule,
    TicketsModule,
    AutomationsModule,
    ReportsModule,
    SearchModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global: an endpoint has to be listed somewhere to be unthrottled, rather
    // than being unthrottled by default because nobody remembered to add it.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
