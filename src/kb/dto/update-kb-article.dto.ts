import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { KB_STATUSES, KB_VISIBILITIES } from '../kb-article.schema';
import type { KbStatus, KbVisibility } from '../kb-article.schema';

/** Title changes do NOT change the slug (public links stay stable). */
export class UpdateKbArticleDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  @MaxLength(200)
  title?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  @MaxLength(50000)
  body?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  category?: string;

  @IsArray()
  @IsString({ each: true })
  @MaxLength(30, { each: true })
  @ArrayMaxSize(10)
  @IsOptional()
  tags?: string[];

  @IsIn(KB_STATUSES)
  @IsOptional()
  status?: KbStatus;

  @IsIn(KB_VISIBILITIES)
  @IsOptional()
  visibility?: KbVisibility;
}
