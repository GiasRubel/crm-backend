import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** Staff comment; `isInternal` notes are hidden from the customer. */
export class AddTicketCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  body: string;

  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  isInternal?: boolean;
}

/** Portal customer reply — always public. */
export class AddMyTicketCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  body: string;
}
