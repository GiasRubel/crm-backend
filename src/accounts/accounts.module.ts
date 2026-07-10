import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Contact, ContactSchema } from '../contacts/contact.schema';
import {
  Opportunity,
  OpportunitySchema,
} from '../opportunities/opportunity.schema';
import { TeamsModule } from '../teams/teams.module';
import { UsersModule } from '../users/users.module';
import { Account, AccountSchema } from './account.schema';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';

@Module({
  imports: [
    // Contact & Opportunity models are registered read/unlink-only for the
    // 360° summary, link counts, and delete-time unlinking. Their write
    // paths live in their own modules; this avoids a module cycle since
    // ContactsModule/OpportunitiesModule import AccountsModule.
    MongooseModule.forFeature([
      { name: Account.name, schema: AccountSchema },
      { name: Contact.name, schema: ContactSchema },
      { name: Opportunity.name, schema: OpportunitySchema },
    ]),
    UsersModule,
    TeamsModule,
  ],
  controllers: [AccountsController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}
