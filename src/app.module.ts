import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { MailModule } from './mail/mail.module';
import { KeycloakAdminModule } from './keycloak-admin/keycloak-admin.module';
import { PasswordModule } from './auth/password/password.module';
import { CustomersModule } from './customers/customers.module';
import { TeamsModule } from './teams/teams.module';
import { LeadsModule } from './leads/leads.module';
import { OpportunitiesModule } from './opportunities/opportunities.module';
import { AccountsModule } from './accounts/accounts.module';
import { ContactsModule } from './contacts/contacts.module';
import { ActivitiesModule } from './activities/activities.module';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
    LicensingModule, // Must run before AuthModule: gates the whole API on activation
    AuthModule,
    UsersModule,
    OrganizationsModule,
    SubscriptionsModule,
    MailModule,
    PasswordModule,
    TeamsModule,
    CustomersModule,
    AccountsModule,
    ContactsModule,
    OpportunitiesModule,
    LeadsModule,
    ActivitiesModule,
    KbModule,
    TicketsModule,
    AutomationsModule,
    ReportsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
