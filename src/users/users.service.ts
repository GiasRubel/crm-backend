import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { KeycloakJwtPayload } from '../auth/interfaces/keycloak-jwt-payload.interface';
import { AppRole } from './app-role.enum';
import { UserResponseDto } from './dto/user-response.dto';
import { toUserResponseDto } from './mappers/user.mapper';
import { User, UserDocument } from './users.schema';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async findByKeycloakId(keycloakId: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ keycloakId }).exec();
  }

  async getOrProvisionMe(payload: KeycloakJwtPayload): Promise<UserResponseDto> {
    const existing = await this.findByKeycloakId(payload.sub);

    if (existing) {
      const synced = await this.syncIdentityFields(existing, payload);
      return toUserResponseDto(synced);
    }

    const created = await this.provisionFromJwt(payload);
    return toUserResponseDto(created);
  }

  private extractIdentity(payload: KeycloakJwtPayload) {
    const email = payload.email?.trim().toLowerCase();

    if (!email) {
      throw new BadRequestException('Email claim is required to provision user');
    }

    return {
      keycloakId: payload.sub,
      email,
      username: payload.preferred_username?.trim() ?? '',
      firstName: payload.given_name?.trim() ?? '',
      lastName: payload.family_name?.trim() ?? '',
    };
  }

  private async provisionFromJwt(payload: KeycloakJwtPayload): Promise<UserDocument> {
    const identity = this.extractIdentity(payload);

    return this.userModel.create({
      ...identity,
      role: AppRole.User,
    });
  }

  private async syncIdentityFields(
    user: UserDocument,
    payload: KeycloakJwtPayload,
  ): Promise<UserDocument> {
    const identity = this.extractIdentity(payload);
    const updates: Partial<User> = {};

    if (user.email !== identity.email) updates.email = identity.email;
    if (user.username !== identity.username) updates.username = identity.username;
    if (user.firstName !== identity.firstName) updates.firstName = identity.firstName;
    if (user.lastName !== identity.lastName) updates.lastName = identity.lastName;

    if (Object.keys(updates).length === 0) {
      return user;
    }

    return this.userModel
      .findByIdAndUpdate(user._id, { $set: updates }, { new: true })
      .orFail()
      .exec();
  }
}
