import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { TICKET_PRIORITIES, TICKET_TYPES } from '../ticket.schema';
import type { TicketPriority, TicketType } from '../ticket.schema';

/**
 * Staff edits. Status changes go through PATCH /tickets/:id/status so
 * the timestamps and events stay consistent; the customer link is fixed.
 */
export class UpdateTicketDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  @MaxLength(200)
  subject?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  @MaxLength(10000)
  description?: string;

  @IsIn(TICKET_TYPES)
  @IsOptional()
  type?: TicketType;

  @IsIn(TICKET_PRIORITIES)
  @IsOptional()
  priority?: TicketPriority;

  /** Replaces the linked-KB-article list (validated to exist). */
  @IsArray()
  @IsMongoId({ each: true })
  @ArrayMaxSize(10)
  @IsOptional()
  relatedArticleIds?: string[];
}
