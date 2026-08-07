import { IsEmail } from 'class-validator';

export class ResolveAuthProviderDto {
  @IsEmail()
  email: string;
}
