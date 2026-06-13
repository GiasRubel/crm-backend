import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateCustomerDto {
  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  company?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsEnum(['active', 'inactive', 'prospect'])
  @IsOptional()
  status?: 'active' | 'inactive' | 'prospect';
}
