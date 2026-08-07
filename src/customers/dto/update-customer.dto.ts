import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class UpdateCustomerDto {
  @IsEmail()
  @IsOptional()
  @MaxLength(254)
  email?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  @MaxLength(100)
  firstName?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  @MaxLength(100)
  lastName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(30)
  @Matches(/^\+?[0-9\s().-]{6,}$/, {
    message: 'phone must be a valid phone number',
  })
  phone?: string;

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

  /** Admin-defined field values, keyed by CustomFieldDefinition.key. Merged into existing values. */
  @IsObject()
  @IsOptional()
  customFields?: Record<string, unknown>;
}
