import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class SearchQueryDto {
  @IsString()
  @MinLength(2)
  q: string;

  /** Max results per record type (not a total cap). */
  @IsInt()
  @Min(1)
  @Max(20)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 5;
}
