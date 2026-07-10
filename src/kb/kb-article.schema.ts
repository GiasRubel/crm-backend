import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type KbArticleDocument = HydratedDocument<KbArticle>;

export const KB_STATUSES = ['draft', 'published', 'archived'] as const;
export type KbStatus = (typeof KB_STATUSES)[number];

/** internal = staff wiki; public = shows on the unauthenticated FAQ. */
export const KB_VISIBILITIES = ['internal', 'public'] as const;
export type KbVisibility = (typeof KB_VISIBILITIES)[number];

/**
 * Knowledge-base article: internal wiki page or public FAQ entry.
 * The body is stored as plain text / markdown source.
 */
@Schema({ timestamps: true })
export class KbArticle {
  @Prop({ required: true, trim: true })
  title: string;

  /** URL identifier for the public FAQ; unique, derived from the title. */
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  slug: string;

  @Prop({ required: true })
  body: string;

  /** Free-text grouping (e.g. "billing", "how-to"); lowercased. */
  @Prop({ trim: true, lowercase: true, index: true })
  category?: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: String, enum: KB_STATUSES, default: 'draft', index: true })
  status: KbStatus;

  @Prop({
    type: String,
    enum: KB_VISIBILITIES,
    default: 'internal',
    index: true,
  })
  visibility: KbVisibility;

  /** keycloakId of the staff author. */
  @Prop({ required: true })
  authorId: string;

  /** keycloakId of the last editor. */
  @Prop()
  updatedById?: string;

  @Prop()
  publishedAt?: Date;

  // ── Engagement counters (public FAQ) ────────────────────────────────────
  @Prop({ default: 0 })
  views: number;

  @Prop({ default: 0 })
  helpfulCount: number;

  @Prop({ default: 0 })
  notHelpfulCount: number;

  // Managed by { timestamps: true }
  createdAt?: Date;
  updatedAt?: Date;
}

export const KbArticleSchema = SchemaFactory.createForClass(KbArticle);

// Public FAQ search hits title/body/tags
KbArticleSchema.index({ title: 'text', body: 'text', tags: 'text' });
