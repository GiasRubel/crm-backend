import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { APP_GUARD } from '@nestjs/core';
import { License, LicenseSchema } from './license.schema';
import { LicensingService } from './licensing.service';
import { LicensingController } from './licensing.controller';
import { LicensingGuard } from './licensing.guard';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: License.name, schema: LicenseSchema }]),
  ],
  controllers: [LicensingController],
  providers: [
    LicensingService,
    {
      provide: APP_GUARD,
      useClass: LicensingGuard,
    },
  ],
  exports: [LicensingService],
})
export class LicensingModule {}
