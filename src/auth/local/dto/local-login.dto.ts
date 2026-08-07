import { IsEmail, IsString, MinLength } from 'class-validator';

export class LocalLoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  password: string;
}
