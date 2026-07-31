import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import type {
  ReportGranularity,
  ReportMetricFn,
  ReportOperator,
} from './report-datasets';

export type SavedReportDocument = HydratedDocument<SavedReport>;

/** One filter clause of a saved report definition. */
@Schema({ _id: false })
export class SavedReportFilter {
  @Prop({ required: true })
  field: string;

  @Prop({ required: true })
  operator: ReportOperator;

  /** Scalar or array; type depends on field/operator. */
  @Prop({ type: MongooseSchema.Types.Mixed })
  value?: unknown;
}
export const SavedReportFilterSchema =
  SchemaFactory.createForClass(SavedReportFilter);

/** One aggregation metric of a saved report definition. */
@Schema({ _id: false })
export class SavedReportMetric {
  @Prop({ required: true })
  fn: ReportMetricFn;

  @Prop()
  field?: string;

  @Prop()
  alias?: string;
}
export const SavedReportMetricSchema =
  SchemaFactory.createForClass(SavedReportMetric);

@Schema({ _id: false })
export class SavedReportDateRange {
  @Prop()
  field?: string;

  @Prop()
  from?: string;

  @Prop()
  to?: string;
}
export const SavedReportDateRangeSchema =
  SchemaFactory.createForClass(SavedReportDateRange);

/**
 * A persisted Custom Report Builder definition. The definition mirrors
 * `RunReportDto`; running a saved report re-validates it through the same
 * engine, so a dataset/field that later disappears fails loudly rather than
 * returning garbage.
 */
@Schema({ timestamps: true })
export class SavedReport {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true,
  })
  organizationId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ required: true, index: true })
  dataset: string;

  @Prop({ type: [SavedReportFilterSchema], default: [] })
  filters: SavedReportFilter[];

  @Prop({ type: SavedReportDateRangeSchema })
  dateRange?: SavedReportDateRange;

  @Prop()
  groupBy?: string;

  @Prop()
  groupByGranularity?: ReportGranularity;

  @Prop({ type: [SavedReportMetricSchema], default: [] })
  metrics: SavedReportMetric[];

  @Prop({ type: [String], default: [] })
  columns: string[];

  @Prop()
  sortBy?: string;

  @Prop({ type: String, enum: ['asc', 'desc'] })
  sortOrder?: 'asc' | 'desc';

  /** Shared reports are visible to all staff; otherwise creator-only. */
  @Prop({ default: false })
  shared: boolean;

  /** keycloakId of the staff user who owns the report. */
  @Prop({ required: true, index: true })
  createdBy: string;

  // Managed by { timestamps: true }
  createdAt?: Date;
  updatedAt?: Date;
}

export const SavedReportSchema = SchemaFactory.createForClass(SavedReport);
