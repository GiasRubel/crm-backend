import { Module } from '@nestjs/common';
import { OtpModule } from '../../otp/otp.module';
import { UsersModule } from '../../users/users.module';
import { OrganizationsModule } from '../../organizations/organizations.module';
import { LocalAuthModule } from '../local/local-auth.module';
import { PasswordController } from './password.controller';
import { PasswordService } from './password.service';

@Module({
  // KeycloakAdminModule is @Global() — no need to import it here
  imports: [OtpModule, UsersModule, OrganizationsModule, LocalAuthModule],
  controllers: [PasswordController],
  providers: [PasswordService],
})
export class PasswordModule {}
