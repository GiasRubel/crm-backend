import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type TicketDocument = HydratedDocument<Ticket>;

export const TICKET_TYPES = [
  'question',
  'problem',
  'bug',
  'feature_request',
  'billing',
  'other',
] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

export const TICKET_STATUSES = [
  'open',
  'in_progress',
  'waiting_on_customer',
  'resolved',
  'closed',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** Statuses where the ball is in the team's court (SLA-relevant). */
export const ACTIVE_TICKET_STATUSES: readonly TicketStatus[] = [
  'open',
  'in_progress',
];

export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const COMMENT_AUTHOR_ROLES = ['staff', 'customer'] as const;
export type CommentAuthorRole = (typeof COMMENT_AUTHOR_ROLES)[number];

/** One entry in a ticket's conversation thread. */
@Schema({ _id: false })
export class TicketComment {
  /** keycloakId of the author (staff user or portal customer). */
  @Prop({ required: true })
  authorId: string;

  @Prop({ type: String, enum: COMMENT_AUTHOR_ROLES, required: true })
  authorRole: CommentAuthorRole;

  @Prop({ required: true, trim: true })
  body: string;

  /** Staff-only note — never shown to the customer. */
  @Prop({ default: false })
  isInternal: boolean;

  @Prop({ required: true })
  postedAt: Date;
}
export const TicketCommentSchema = SchemaFactory.createForClass(TicketComment);

@Schema({ timestamps: true })
export class Ticket {
  /** Human-readable reference (TKT-1001), from an atomic counter. */
  @Prop({ required: true, unique: true })
  number: string;

  @Prop({ required: true, trim: true })
  subject: string;

  @Prop({ required: true, trim: true })
  description: string;

  @Prop({ type: String, enum: TICKET_TYPES, default: 'question', index: true })
  type: TicketType;

  @Prop({ type: String, enum: TICKET_STATUSES, default: 'open', index: true })
  status: TicketStatus;

  @Prop({ type: String, enum: TICKET_PRIORITIES, default: 'normal' })
  priority: TicketPriority;

  /** The customer this ticket belongs to. */
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Customer',
    required: true,
    index: true,
  })
  customerId: Types.ObjectId;

  @Prop({ type: [TicketCommentSchema], default: [] })
  comments: TicketComment[];

  /** KB articles linked as (candidate) resolutions. */
  @Prop({
    type: [MongooseSchema.Types.ObjectId],
    ref: 'KbArticle',
    default: [],
  })
  relatedArticleIds: Types.ObjectId[];

  // ── Response-time tracking ──────────────────────────────────────────────
  /** First public staff comment — the "first response" SLA moment. */
  @Prop()
  firstResponseAt?: Date;

  @Prop()
  resolvedAt?: Date;

  @Prop()
  closedAt?: Date;

  /** keycloakId of the creator (staff user or the portal customer). */
  @Prop({ required: true, index: true })
  createdBy: string;

  /** keycloakId of the staff user who owns this ticket. */
  @Prop({ index: true })
  assignedToId?: string;

  /** Team this record is routed to; drives row-level visibility for members. */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Team', index: true })
  assignedTeamId?: Types.ObjectId;

  // Managed by { timestamps: true }
  createdAt?: Date;
  updatedAt?: Date;
}

export const TicketSchema = SchemaFactory.createForClass(Ticket);

TicketSchema.index({ status: 1, priority: 1, updatedAt: -1 });

/** Atomic sequence for human-readable ticket numbers. */
@Schema()
export class TicketCounter {
  @Prop({ required: true })
  _id: string;

  @Prop({ default: 1000 })
  seq: number;
}
export type TicketCounterDocument = HydratedDocument<TicketCounter>;
export const TicketCounterSchema = SchemaFactory.createForClass(TicketCounter);
