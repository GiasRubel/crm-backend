import {
  IsEmail,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateCustomerDto {
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(254)
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  @Matches(/^\+?[0-9\s().-]{6,}$/, {
    message: 'phone must be a valid phone number',
  })
  phone: string;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  company?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  address?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  notes?: string;

  @IsEnum(['active', 'inactive', 'prospect'])
  @IsOptional()
  status?: 'active' | 'inactive' | 'prospect';

  /** Optional initial record owner (keycloakId of a staff user). */
  @IsString()
  @IsOptional()
  assignedToId?: string;

  /** Optional initial team routing (team id). */
  @IsMongoId()
  @IsOptional()
  assignedTeamId?: string;

  /** Admin-defined field values, keyed by CustomFieldDefinition.key. */
  @IsObject()
  @IsOptional()
  customFields?: Record<string, unknown>;
}
