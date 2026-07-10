import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'events';

/** Domain events feature services emit after committing a state change. */
export const CRM_EVENTS = [
  'lead.created',
  'lead.status_changed',
  'lead.score_changed',
  'opportunity.created',
  'opportunity.stage_changed',
  'customer.created',
  'contact.created',
  'ticket.created',
  'ticket.status_changed',
] as const;
export type CrmEvent = (typeof CRM_EVENTS)[number];

/** Record kinds that can appear in an event payload. */
export type CrmEventRecordType =
  | 'lead'
  | 'opportunity'
  | 'customer'
  | 'contact'
  | 'ticket';

export interface CrmEventPayload {
  event: CrmEvent;
  recordType: CrmEventRecordType;
  recordId: string;
  /** Plain snapshot of the record after the change (doc.toObject()). */
  record: Record<string, unknown>;
  /** Transition context, e.g. previousStatus/newStatus, previousScore/newScore. */
  context: Record<string, unknown>;
}

/**
 * In-process pub/sub for domain events (plain Node EventEmitter — no
 * external broker). Emission is deferred to the next tick and subscriber
 * errors are swallowed and logged, so publishing can never fail or slow a
 * user request. Registered globally via EventsModule.
 */
@Injectable()
export class CrmEventBus {
  private readonly logger = new Logger(CrmEventBus.name);
  private readonly emitter = new EventEmitter();

  constructor() {
    // The automation engine is the intended consumer; a few rules per
    // event is normal, but warn loudly instead of hard-crashing on leaks.
    this.emitter.setMaxListeners(50);
  }

  emit(payload: CrmEventPayload): void {
    setImmediate(() => {
      try {
        this.emitter.emit(payload.event, payload);
      } catch (error) {
        this.logger.error(`Event handler for ${payload.event} threw:`, error);
      }
    });
  }

  on(
    event: CrmEvent,
    handler: (payload: CrmEventPayload) => void | Promise<void>,
  ): void {
    this.emitter.on(event, (payload: CrmEventPayload) => {
      Promise.resolve(handler(payload)).catch((error) =>
        this.logger.error(`Event handler for ${event} failed:`, error),
      );
    });
  }
}
