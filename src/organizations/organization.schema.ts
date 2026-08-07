import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type OrganizationDocument = HydratedDocument<Organization>;

export const ORGANIZATION_STATUSES = ['active', 'suspended'] as const;
export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];

export const ORGANIZATION_AUTH_PROVIDERS = ['keycloak', 'local'] as const;
export type OrganizationAuthProvider =
  (typeof ORGANIZATION_AUTH_PROVIDERS)[number];

@Schema({ timestamps: true })
export class Organization {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  })
  slug: string;

  @Prop({ type: String, enum: ORGANIZATION_STATUSES, default: 'active' })
  status: OrganizationStatus;

  // Which identity provider this org's users authenticate against. Keycloak
  // SSO is the default for every existing organization; PlatformAdmin can
  // flip a tenant to Mongo-backed local auth via PATCH /organizations/:id.
  @Prop({
    type: String,
    enum: ORGANIZATION_AUTH_PROVIDERS,
    default: 'keycloak',
  })
  authProvider: OrganizationAuthProvider;

  // Managed by { timestamps: true }
  createdAt?: Date;
  updatedAt?: Date;
}

export const OrganizationSchema = SchemaFactory.createForClass(Organization);
