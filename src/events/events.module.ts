import { Global, Module } from '@nestjs/common';
import { CrmEventBus } from './crm-event-bus.service';

/** Global — inject CrmEventBus anywhere without importing this module. */
@Global()
@Module({
  providers: [CrmEventBus],
  exports: [CrmEventBus],
})
export class EventsModule {}
