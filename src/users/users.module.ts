import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './users.schema';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { BootstrapModule } from '../bootstrap/bootstrap.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { OtpModule } from '../otp/otp.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    BootstrapModule,
    // Organizations already imports UsersModule (admin-provisioning); Users
    // needs Organizations back to read an org's authProvider when creating
    // staff — forwardRef breaks the genuine two-way module cycle.
    forwardRef(() => OrganizationsModule),
    OtpModule,
    // AuditModule is @Global() and no longer imports UsersModule (it reads
    // the User model directly), so this is a one-way dependency — no cycle.
  ],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
