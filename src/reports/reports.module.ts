import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Activity, ActivitySchema } from '../activities/activity.schema';
import { Customer, CustomerSchema } from '../customers/customer.schema';
import { Lead, LeadSchema } from '../leads/lead.schema';
import {
  Opportunity,
  OpportunitySchema,
} from '../opportunities/opportunity.schema';
import { TeamsModule } from '../teams/teams.module';
import { Ticket, TicketSchema } from '../tickets/ticket.schema';
import { UsersModule } from '../users/users.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { SavedReport, SavedReportSchema } from './saved-report.schema';

/**
 * Read-only analytics across the CRM. Registers the domain schemas it
 * aggregates over directly (like AccountsModule/ActivitiesModule) rather than
 * importing every feature module, which would create dependency cycles.
 * UsersModule + TeamsModule provide name denormalization and the row-level
 * visibility inputs.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Opportunity.name, schema: OpportunitySchema },
      { name: Lead.name, schema: LeadSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: Activity.name, schema: ActivitySchema },
      { name: Ticket.name, schema: TicketSchema },
      { name: SavedReport.name, schema: SavedReportSchema },
    ]),
    UsersModule,
    TeamsModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
