import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type TeamDocument = HydratedDocument<Team>;

@Schema({ timestamps: true })
export class Team {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId: Types.ObjectId;

  @Prop({ required: true, unique: true, trim: true })
  name: string;

  @Prop({ trim: true })
  description?: string;

  /**
   * Territory scope of the team — free-form region tags (e.g. "EMEA",
   * "Germany", "Berlin"). Used to route new records to the right team.
   */
  @Prop({ type: [String], default: [] })
  regions: string[];

  /** keycloakId of the team lead. Must always be one of memberIds. */
  @Prop({ trim: true })
  leaderId?: string;

  /** keycloakIds of staff users (never Customer-role users). */
  @Prop({ type: [String], default: [], index: true })
  memberIds: string[];

  /** Inactive teams keep their assignments but stop granting visibility and routing. */
  @Prop({ default: true })
  isActive: boolean;

  @Prop({ required: true })
  createdBy: string; // keycloakId of staff who created the team

  // Managed by { timestamps: true }
  createdAt?: Date;
  updatedAt?: Date;
}

export const TeamSchema = SchemaFactory.createForClass(Team);
