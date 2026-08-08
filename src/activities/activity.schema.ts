import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type ActivityDocument = HydratedDocument<Activity>;

/**
 * `task` is an internal to-do; the rest are communications — either
 * scheduled ahead of time (pending) or logged after the fact (completed).
 */
export const ACTIVITY_TYPES = [
  'task',
  'call',
  'email',
  'meeting',
  'sms',
  'note',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** Communication types (everything except task). */
export const COMMUNICATION_TYPES: readonly ActivityType[] = [
  'call',
  'email',
  'meeting',
  'sms',
  'note',
];

export const ACTIVITY_STATUSES = ['pending', 'completed', 'cancelled'] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

export const ACTIVITY_PRIORITIES = ['low', 'normal', 'high'] as const;
export type ActivityPriority = (typeof ACTIVITY_PRIORITIES)[number];

export const ACTIVITY_DIRECTIONS = ['inbound', 'outbound'] as const;
export type ActivityDirection = (typeof ACTIVITY_DIRECTIONS)[number];

/** CRM records an activity can be attached to (polymorphic link). */
export const RELATED_TYPES = [
  'lead',
  'contact',
  'customer',
  'account',
  'opportunity',
  'ticket',
] as const;
export type RelatedType = (typeof RELATED_TYPES)[number];

@Schema({ timestamps: true })
export class Activity {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true,
  })
  organizationId: Types.ObjectId;

  @Prop({ type: String, enum: ACTIVITY_TYPES, required: true, index: true })
  type: ActivityType;

  @Prop({ required: true, trim: true })
  subject: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({
    type: String,
    enum: ACTIVITY_STATUSES,
    default: 'pending',
    index: true,
  })
  status: ActivityStatus;

  @Prop({ type: String, enum: ACTIVITY_PRIORITIES, default: 'normal' })
  priority: ActivityPriority;

  /** Who initiated a communication. Not set on tasks/notes. */
  @Prop({ type: String, enum: ACTIVITY_DIRECTIONS })
  direction?: ActivityDirection;

  // ── Scheduling ──────────────────────────────────────────────────────────
  /** Task deadline / follow-up date. */
  @Prop({ index: true })
  dueAt?: Date;

  /** Scheduled start (meetings/calls planned ahead — calendar events). */
  @Prop()
  startAt?: Date;

  /** Scheduled end; must be after startAt. */
  @Prop()
  endAt?: Date;

  /** Follow-up reminder timestamp (surfaced in the reminders feed). */
  @Prop()
  remindAt?: Date;

  @Prop()
  completedAt?: Date;

  // ── Polymorphic link to the CRM record this activity is about ──────────
  @Prop({ type: String, enum: RELATED_TYPES, index: true })
  relatedType?: RelatedType;

  @Prop({ type: MongooseSchema.Types.ObjectId, index: true })
  relatedId?: Types.ObjectId;

  /**
   * Set once a completed communication has been fed into the linked
   * record's history (lead engagement / contact interaction), so a
   * reopen + re-complete never double-logs it.
   */
  @Prop({ default: false })
  syncedToRecord: boolean;

  // ── Ownership / routing (standard visibility fields) ───────────────────
  /** keycloakId of the staff creator. */
  @Prop({ required: true, index: true })
  createdBy: string;

  /** keycloakId of the staff user responsible for this activity. */
  @Prop({ required: true, index: true })
  assignedToId: string;

  /** Team this record is routed to; drives row-level visibility for members. */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Team', index: true })
  assignedTeamId?: Types.ObjectId;

  /**
   * Live two-way calendar sync mapping (meetings only — see CalendarSyncService).
   * `remoteUpdatedAt` is the provider's own last-modified stamp, used to decide
   * pull-vs-push precedence; `lastPushedAt` guards against push/pull echo loops.
   */
  @Prop({
    type: {
      connectionId: { type: MongooseSchema.Types.ObjectId, required: true },
      provider: { type: String, enum: ['google', 'microsoft'], required: true },
      eventId: { type: String, required: true },
      remoteUpdatedAt: { type: Date },
      lastPushedAt: { type: Date },
    },
    _id: false,
  })
  externalCalendar?: {
    connectionId: Types.ObjectId;
    provider: 'google' | 'microsoft';
    eventId: string;
    remoteUpdatedAt?: Date;
    lastPushedAt?: Date;
  };

  // Managed by { timestamps: true }
  createdAt?: Date;
  updatedAt?: Date;
}

export const ActivitySchema = SchemaFactory.createForClass(Activity);

// The task list / timeline is queried by assignee + status + due date
ActivitySchema.index({ assignedToId: 1, status: 1, dueAt: 1 });
ActivitySchema.index({ relatedType: 1, relatedId: 1, createdAt: -1 });
ActivitySchema.index(
  { 'externalCalendar.connectionId': 1, 'externalCalendar.eventId': 1 },
  { sparse: true },
);
