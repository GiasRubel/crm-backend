import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type AutomationRunDocument = HydratedDocument<AutomationRun>;

export const RUN_STATUSES = ['success', 'partial', 'failed'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

/** Execution-log entry: one rule firing against one record. */
@Schema({ timestamps: true })
export class AutomationRun {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId: Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'AutomationRule',
    required: true,
    index: true,
  })
  ruleId: Types.ObjectId;

  /** Denormalized so the log stays readable after a rule is deleted. */
  @Prop({ required: true, trim: true })
  ruleName: string;

  /** The trigger event, or `sla.breach` for idle-sweep escalations. */
  @Prop({ required: true })
  event: string;

  @Prop({ required: true })
  recordType: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  recordId: Types.ObjectId;

  @Prop({ trim: true })
  recordName?: string;

  @Prop({ type: String, enum: RUN_STATUSES, required: true, index: true })
  status: RunStatus;

  /** One line per action: what ran and how it went. */
  @Prop({ type: [String], default: [] })
  logs: string[];

  // Managed by { timestamps: true }
  createdAt?: Date;
  updatedAt?: Date;
}

export const AutomationRunSchema = SchemaFactory.createForClass(AutomationRun);

// SLA dedupe looks up the latest run per rule+record
AutomationRunSchema.index({ ruleId: 1, recordId: 1, createdAt: -1 });
