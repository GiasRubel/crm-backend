import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { AppRole } from './app-role.enum';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true,
  })
  organizationId: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true })
  keycloakId: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ trim: true })
  username: string;

  @Prop({ trim: true })
  firstName: string;

  @Prop({ trim: true })
  lastName: string;

  @Prop({ type: String, enum: AppRole, default: AppRole.User })
  role: AppRole;

  // Only meaningful when role === AppRole.User — narrows that user's CRUD
  // access and row-level visibility per the referenced CustomRole's matrix,
  // instead of the legacy full-access default. See roles/permissions.service.ts.
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'CustomRole',
    default: null,
  })
  customRoleId?: Types.ObjectId | null;

  // Only set for users of a 'local' authProvider organization. Never exposed
  // by any mapper — see users/mappers/user.mapper.ts.
  @Prop({ type: String, select: false })
  passwordHash?: string;

  // Bumped on password change to invalidate every outstanding local-auth
  // refresh token at once (see auth/local/local-auth.service.ts).
  @Prop({ type: Number, default: 0 })
  tokenVersion: number;
}

export const UserSchema = SchemaFactory.createForClass(User);
