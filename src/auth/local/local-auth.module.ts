import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../../users/users.schema';
import { UsersModule } from '../../users/users.module';
import { OrganizationsModule } from '../../organizations/organizations.module';
import { LocalAuthService } from './local-auth.service';
import { LocalJwtStrategy } from './local-jwt.strategy';
import { LocalAuthController } from './local-auth.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    JwtModule.register({}),
    UsersModule,
    OrganizationsModule,
  ],
  controllers: [LocalAuthController],
  providers: [LocalAuthService, LocalJwtStrategy],
  exports: [LocalAuthService],
})
export class LocalAuthModule {}
