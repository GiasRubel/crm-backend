import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/users.schema';
import { AuditController } from './audit.controller';
import { AuditLog, AuditLogSchema } from './audit-log.schema';
import { AuditService } from './audit.service';

/** Global — AuditService injectable everywhere, same precedent as EventsModule. */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AuditLog.name, schema: AuditLogSchema },
      // Read-only, for denormalizing actor display names in mapMany() —
      // registered directly (not via UsersModule) to avoid a module cycle
      // with UsersService, which injects AuditService.
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
