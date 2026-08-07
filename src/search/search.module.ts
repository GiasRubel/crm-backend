import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Account, AccountSchema } from '../accounts/account.schema';
import { Contact, ContactSchema } from '../contacts/contact.schema';
import { Customer, CustomerSchema } from '../customers/customer.schema';
import { KbArticle, KbArticleSchema } from '../kb/kb-article.schema';
import { Lead, LeadSchema } from '../leads/lead.schema';
import {
  Opportunity,
  OpportunitySchema,
} from '../opportunities/opportunity.schema';
import { Ticket, TicketSchema } from '../tickets/ticket.schema';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [
    // Read-only access — same pattern as AttachmentsModule: register the
    // target schemas directly rather than importing each feature module.
    MongooseModule.forFeature([
      { name: Lead.name, schema: LeadSchema },
      { name: Contact.name, schema: ContactSchema },
      { name: Account.name, schema: AccountSchema },
      { name: Opportunity.name, schema: OpportunitySchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: Ticket.name, schema: TicketSchema },
      { name: KbArticle.name, schema: KbArticleSchema },
    ]),
  ],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
