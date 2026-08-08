import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TeamsModule } from '../teams/teams.module';
import { User, UserSchema } from '../users/users.schema';
import { UsersModule } from '../users/users.module';
import { CustomRole, CustomRoleSchema } from './custom-role.schema';
import { CustomRolesController } from './custom-roles.controller';
import { CustomRolesService } from './custom-roles.service';
import { PermissionsService } from './permissions.service';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CustomRole.name, schema: CustomRoleSchema },
      // Read-only access for user counts; write path stays in UsersModule.
      { name: User.name, schema: UserSchema },
    ]),
    UsersModule,
    TeamsModule,
  ],
  controllers: [CustomRolesController],
  providers: [CustomRolesService, PermissionsService],
  exports: [CustomRolesService, PermissionsService],
})
export class RolesModule {}
