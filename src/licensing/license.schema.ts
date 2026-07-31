import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type LicenseDocument = HydratedDocument<License>;

/** Single document per install — one CodeCanyon purchase activates one deployment. */
@Schema({ timestamps: true })
export class License {
  @Prop({ required: true, unique: true })
  purchaseCodeHash: string;

  @Prop({ required: true })
  envatoItemId: string;

  @Prop()
  buyerUsername?: string;

  @Prop()
  domain?: string;

  @Prop({ default: () => new Date() })
  lastVerifiedAt: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const LicenseSchema = SchemaFactory.createForClass(License);
