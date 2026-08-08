import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  OrgMailSettings,
  OrgMailSettingsSchema,
} from './org-mail-settings.schema';
import { MailSettingsService } from './mail-settings.service';
import { MailSettingsController } from './mail-settings.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OrgMailSettings.name, schema: OrgMailSettingsSchema },
    ]),
  ],
  controllers: [MailSettingsController],
  providers: [MailSettingsService],
})
export class MailSettingsModule {}
