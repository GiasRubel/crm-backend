import { IsEmail, IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { AppRole } from '../app-role.enum';

const STAFF_ROLES = [AppRole.User, AppRole.Admin, AppRole.Administrator] as const;

export class CreateStaffDto {
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

  @IsEnum(STAFF_ROLES)
  role: (typeof STAFF_ROLES)[number];
}
