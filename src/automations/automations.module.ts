import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ActivitiesModule } from '../activities/activities.module';
import { ContactsModule } from '../contacts/contacts.module';
import { CustomersModule } from '../customers/customers.module';
import { Lead, LeadSchema } from '../leads/lead.schema';
import { LeadsModule } from '../leads/leads.module';
import { MailModule } from '../mail/mail.module';
import {
  Opportunity,
  OpportunitySchema,
} from '../opportunities/opportunity.schema';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { TeamsModule } from '../teams/teams.module';
import { Ticket, TicketSchema } from '../tickets/ticket.schema';
import { UsersModule } from '../users/users.module';
import { AutomationRule, AutomationRuleSchema } from './automation-rule.schema';
import { AutomationRun, AutomationRunSchema } from './automation-run.schema';
import { AutomationsController } from './automations.controller';
import { AutomationsService } from './automations.service';

/**
 * The rule engine. Consumes CrmEventBus events (EventsModule is global)
 * and executes actions through the owning feature services — nothing
 * imports this module, so the fan-in of imports below creates no cycles.
 * Lead/Opportunity schemas are additionally registered for the read-only
 * SLA idle sweep.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AutomationRule.name, schema: AutomationRuleSchema },
      { name: AutomationRun.name, schema: AutomationRunSchema },
      { name: Lead.name, schema: LeadSchema },
      { name: Opportunity.name, schema: OpportunitySchema },
      { name: Ticket.name, schema: TicketSchema },
    ]),
    UsersModule,
    TeamsModule,
    MailModule,
    ActivitiesModule,
    LeadsModule,
    OpportunitiesModule,
    CustomersModule,
    ContactsModule,
  ],
  controllers: [AutomationsController],
  providers: [AutomationsService],
  exports: [AutomationsService],
})
export class AutomationsModule {}
