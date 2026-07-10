import { IsIn } from 'class-validator';
import { TICKET_STATUSES } from '../ticket.schema';
import type { TicketStatus } from '../ticket.schema';

export class SetTicketStatusDto {
  @IsIn(TICKET_STATUSES)
  status: TicketStatus;
}
