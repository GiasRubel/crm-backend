import { IsEmail } from 'class-validator';

export class TestMailSettingsDto {
  @IsEmail()
  to: string;
}
