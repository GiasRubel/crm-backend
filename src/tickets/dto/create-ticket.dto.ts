import {
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { TICKET_PRIORITIES, TICKET_TYPES } from '../ticket.schema';
import type { TicketPriority, TicketType } from '../ticket.schema';

/** Staff-side ticket creation (on behalf of a customer). */
export class CreateTicketDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  description: string;

  @IsMongoId()
  @IsNotEmpty()
  customerId: string;

  @IsIn(TICKET_TYPES)
  @IsOptional()
  type?: TicketType;

  @IsIn(TICKET_PRIORITIES)
  @IsOptional()
  priority?: TicketPriority;

  /** Optional initial owner (keycloakId of a staff user). */
  @IsString()
  @IsOptional()
  assignedToId?: string;

  /** Optional initial team routing (team id). */
  @IsMongoId()
  @IsOptional()
  assignedTeamId?: string;
}

/** Portal customers raise tickets for themselves — no routing controls. */
export class CreateMyTicketDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  description: string;

  @IsIn(TICKET_TYPES)
  @IsOptional()
  type?: TicketType;
}
