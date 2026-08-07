import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  CustomFieldDefinition,
  CustomFieldDefinitionSchema,
} from './custom-field-definition.schema';
import { CustomFieldsController } from './custom-fields.controller';
import { CustomFieldsService } from './custom-fields.service';

/** Global — CustomFieldsService injectable everywhere, same precedent as AuditModule. */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CustomFieldDefinition.name, schema: CustomFieldDefinitionSchema },
    ]),
  ],
  controllers: [CustomFieldsController],
  providers: [CustomFieldsService],
  exports: [CustomFieldsService],
})
export class CustomFieldsModule {}
