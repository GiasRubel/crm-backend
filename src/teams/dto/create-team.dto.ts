import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateTeamDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

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

  /** keycloakId of the team lead; must be (or becomes) a member. */
  @IsString()
  @IsOptional()
  leaderId?: string | null;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
