import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CustomersModule } from '../customers/customers.module';
import { KbModule } from '../kb/kb.module';
import { TeamsModule } from '../teams/teams.module';
import { UsersModule } from '../users/users.module';
import {
  Ticket,
  TicketCounter,
  TicketCounterSchema,
  TicketSchema,
} from './ticket.schema';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Ticket.name, schema: TicketSchema },
      { name: TicketCounter.name, schema: TicketCounterSchema },
    ]),
    UsersModule,
    TeamsModule,
    CustomersModule,
    KbModule,
  ],
  controllers: [TicketsController],
  providers: [TicketsService],
  exports: [TicketsService],
})
export class TicketsModule {}
