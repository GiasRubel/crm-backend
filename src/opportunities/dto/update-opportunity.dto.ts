import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

/**
 * Editable deal fields. The stage is deliberately absent — pipeline moves go
 * through PATCH /opportunities/:id/stage so transition rules and history are
 * always applied.
 */
export class UpdateOpportunityDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  @MaxLength(200)
  name?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  amount?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  probability?: number;

  @IsDateString()
  @IsOptional()
  expectedCloseDate?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  notes?: string;

  /** Account link: omitted = unchanged, null = unlink, id = validated & set. */
  @ValidateIf((o: UpdateOpportunityDto) => o.accountId !== null)
  @IsString()
  @IsOptional()
  accountId?: string | null;
}
