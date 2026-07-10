import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { INTERACTION_DIRECTIONS, INTERACTION_TYPES } from '../contact.schema';
import type { InteractionDirection, InteractionType } from '../contact.schema';

/** Log a communication touchpoint on a contact's history. */
export class AddInteractionDto {
  @IsIn(INTERACTION_TYPES)
  type: InteractionType;

  @IsIn(INTERACTION_DIRECTIONS)
  @IsOptional()
  direction?: InteractionDirection;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  subject?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  note?: string;
}
