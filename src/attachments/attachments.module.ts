import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Account, AccountSchema } from '../accounts/account.schema';
import { Contact, ContactSchema } from '../contacts/contact.schema';
import { Customer, CustomerSchema } from '../customers/customer.schema';
import { Lead, LeadSchema } from '../leads/lead.schema';
import {
  Opportunity,
  OpportunitySchema,
} from '../opportunities/opportunity.schema';
import { Ticket, TicketSchema } from '../tickets/ticket.schema';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { Attachment, AttachmentSchema } from './attachment.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Attachment.name, schema: AttachmentSchema },
      // Read/existence-check-only access — the write paths for these
      // documents stay in their own modules (same pattern as AccountsModule
      // registering Contact/Opportunity for cross-collection lookups).
      { name: Lead.name, schema: LeadSchema },
      { name: Contact.name, schema: ContactSchema },
      { name: Account.name, schema: AccountSchema },
      { name: Opportunity.name, schema: OpportunitySchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: Ticket.name, schema: TicketSchema },
    ]),
  ],
  controllers: [AttachmentsController],
  providers: [AttachmentsService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
