import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Account, AccountSchema } from '../accounts/account.schema';
import { CalendarSyncModule } from '../calendar-sync/calendar-sync.module';
import { Contact, ContactSchema } from '../contacts/contact.schema';
import { Customer, CustomerSchema } from '../customers/customer.schema';
import { Lead, LeadSchema } from '../leads/lead.schema';
import {
  Opportunity,
  OpportunitySchema,
} from '../opportunities/opportunity.schema';
import { TeamsModule } from '../teams/teams.module';
import { Ticket, TicketSchema } from '../tickets/ticket.schema';
import { UsersModule } from '../users/users.module';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';
import { Activity, ActivitySchema } from './activity.schema';

@Module({
  imports: [
    // Linked-record schemas are registered for read-mostly use (existence
    // checks, automated assignment, name denormalization) plus the
    // completed-communication feed-through into lead/contact histories.
    // Registering schemas instead of importing feature modules keeps
    // ActivitiesModule dependency-free (AccountsModule precedent).
    MongooseModule.forFeature([
      { name: Activity.name, schema: ActivitySchema },
      { name: Lead.name, schema: LeadSchema },
      { name: Contact.name, schema: ContactSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: Account.name, schema: AccountSchema },
      { name: Opportunity.name, schema: OpportunitySchema },
      { name: Ticket.name, schema: TicketSchema },
    ]),
    UsersModule,
    TeamsModule,
    CalendarSyncModule,
  ],
  controllers: [ActivitiesController],
  providers: [ActivitiesService],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
