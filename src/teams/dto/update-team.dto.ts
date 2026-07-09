import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateTeamDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  regions?: string[];

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  memberIds?: string[];

  /** keycloakId of the team lead; send null to clear the lead. */
  @IsString()
  @IsOptional()
  leaderId?: string | null;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
