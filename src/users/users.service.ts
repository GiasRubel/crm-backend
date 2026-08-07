import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { AuditActor, AuditService } from '../audit/audit.service';
import type { KeycloakJwtPayload } from '../auth/interfaces/keycloak-jwt-payload.interface';
import { KeycloakAdminService } from '../keycloak-admin/keycloak-admin.service';
import { generateLocalSubjectId } from '../auth/local/local-subject-id.util';
import { AppRole } from './app-role.enum';
import { CreateStaffDto } from './dto/create-staff.dto';
import { StaffUserResponseDto } from './dto/staff-user-response.dto';
import { UserResponseDto } from './dto/user-response.dto';
import {
  toStaffUserResponseDto,
  toUserResponseDto,
} from './mappers/user.mapper';
import { User, UserDocument } from './users.schema';
import { DefaultOrgService } from '../bootstrap/default-org.service';
import { DeploymentMode, getDeploymentMode } from '../config/deployment-mode';
import { OrganizationsService } from '../organizations/organizations.service';
import { OtpService } from '../otp/otp.service';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly configService: ConfigService,
    private readonly defaultOrgService: DefaultOrgService,
    private readonly keycloakAdminService: KeycloakAdminService,
    @Inject(forwardRef(() => OrganizationsService))
    private readonly organizationsService: OrganizationsService,
    private readonly otpService: OtpService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Admin-invited teammate. For a Keycloak-mode org: creates the Keycloak
   * identity, sends the "set your password" email, then mirrors it into
   * Mongo (mirrors CustomersService.create's rollback discipline). For a
   * local-auth org: creates the Mongo record only and emails an OTP the
   * invitee uses via POST /auth/password/reset to set their first password.
   */
  async createStaff(
    dto: CreateStaffDto,
    actor: AuditActor,
    organizationId: Types.ObjectId,
  ): Promise<StaffUserResponseDto> {
    const email = dto.email.trim().toLowerCase();

    if (await this.findByEmail(email)) {
      throw new ConflictException('A user with this email already exists');
    }

    const organization =
      await this.organizationsService.findDocById(organizationId);

    if (organization?.authProvider === 'local') {
      const created = await this.createLocalStaffUser(
        email,
        dto.firstName,
        dto.lastName,
        dto.role,
        organizationId,
      );
      try {
        await this.otpService.generateAndSend(created.keycloakId, email);
      } catch (otpError) {
        this.logger.error(
          `Staff user created successfully, but failed to send the initial activation email to ${email}:`,
          otpError,
        );
      }
      void this.auditService.log({
        organizationId,
        actor,
        action: 'invite_sent',
        entityType: 'user',
        entityId: created._id.toString(),
        entityLabel: `${created.firstName} ${created.lastName}`,
        summary: `Invited staff member "${created.firstName} ${created.lastName}" (${created.role})`,
        metadata: { role: created.role },
      });
      return toStaffUserResponseDto(created);
    }

    const keycloakId = await this.keycloakAdminService.createUser(
      email,
      dto.firstName.trim(),
      dto.lastName.trim(),
    );

    try {
      const created = await this.createUser(
        keycloakId,
        email,
        dto.firstName,
        dto.lastName,
        dto.role,
        organizationId,
      );

      try {
        await this.keycloakAdminService.sendSetPasswordEmail(keycloakId);
      } catch (emailError) {
        this.logger.error(
          `Staff user created successfully, but Keycloak failed to send the initial invitation email to ${email}:`,
          emailError,
        );
      }

      void this.auditService.log({
        organizationId,
        actor,
        action: 'invite_sent',
        entityType: 'user',
        entityId: created._id.toString(),
        entityLabel: `${created.firstName} ${created.lastName}`,
        summary: `Invited staff member "${created.firstName} ${created.lastName}" (${created.role})`,
        metadata: { role: created.role },
      });
      return toStaffUserResponseDto(created);
    } catch (error) {
      this.logger.error(
        `Failed to write staff user to MongoDB. Rolling back Keycloak user ${keycloakId}`,
        error,
      );
      try {
        await this.keycloakAdminService.deleteUser(keycloakId);
      } catch (kcError) {
        this.logger.error(
          `Rollback critical failure: could not delete Keycloak user ${keycloakId}:`,
          kcError,
        );
      }
      throw error;
    }
  }

  async findByKeycloakId(keycloakId: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ keycloakId }).exec();
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.trim().toLowerCase() }).exec();
  }

  /** Staff users (any role except Customer) matching the given keycloakIds. */
  async findStaffByKeycloakIds(keycloakIds: string[]): Promise<UserDocument[]> {
    if (keycloakIds.length === 0) return [];
    return this.userModel
      .find({
        keycloakId: { $in: keycloakIds },
        role: { $ne: AppRole.Customer },
      })
      .exec();
  }

  /** All staff users (any role except Customer), for team member pickers. */
  async findAllStaff(): Promise<UserDocument[]> {
    return this.userModel
      .find({ role: { $ne: AppRole.Customer } })
      .sort({ firstName: 1, lastName: 1 })
      .exec();
  }

  async createCustomerUser(
    keycloakId: string,
    email: string,
    firstName: string,
    lastName: string,
    organizationId: Types.ObjectId,
  ): Promise<UserDocument> {
    return this.userModel.create({
      organizationId,
      keycloakId,
      email: email.trim().toLowerCase(),
      username: email.trim().toLowerCase(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role: AppRole.Customer,
    });
  }

  async createUser(
    keycloakId: string,
    email: string,
    firstName: string,
    lastName: string,
    role: AppRole,
    organizationId: Types.ObjectId,
  ): Promise<UserDocument> {
    return this.userModel.create({
      organizationId,
      keycloakId,
      email: email.trim().toLowerCase(),
      username: email.trim().toLowerCase(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role,
    });
  }

  /** Mirrors createUser, but never touches Keycloak — used for local-auth orgs. */
  async createLocalStaffUser(
    email: string,
    firstName: string,
    lastName: string,
    role: AppRole,
    organizationId: Types.ObjectId,
  ): Promise<UserDocument> {
    return this.userModel.create({
      organizationId,
      keycloakId: generateLocalSubjectId(),
      email: email.trim().toLowerCase(),
      username: email.trim().toLowerCase(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role,
    });
  }

  async deleteByKeycloakId(keycloakId: string): Promise<void> {
    await this.userModel.deleteOne({ keycloakId }).exec();
  }

  async getOrProvisionMe(
    payload: KeycloakJwtPayload,
  ): Promise<UserResponseDto> {
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
      throw new BadRequestException(
        'Email claim is required to provision user',
      );
    }

    // Undefined (not '') when the claim is simply absent from this token —
    // local-auth tokens deliberately carry only sub+email, and an absent
    // claim must never be read as "the user cleared their name."
    return {
      keycloakId: payload.sub,
      email,
      username: payload.preferred_username?.trim(),
      firstName: payload.given_name?.trim(),
      lastName: payload.family_name?.trim(),
    };
  }

  private async provisionFromJwt(
    payload: KeycloakJwtPayload,
  ): Promise<UserDocument> {
    const identity = this.extractIdentity(payload);
    const existing = await this.findByEmail(identity.email);

    if (existing) {
      existing.keycloakId = payload.sub;
      await existing.save();
      return this.syncIdentityFields(existing, payload);
    }

    // Standalone (Regular License) deployments have no admin-provisioning
    // flow — the first person to log in becomes the org's Admin.
    if (getDeploymentMode(this.configService) === DeploymentMode.Standalone) {
      const userCount = await this.userModel.estimatedDocumentCount().exec();
      if (userCount === 0) {
        const organizationId =
          await this.defaultOrgService.getDefaultOrganizationId();
        return this.createUser(
          payload.sub,
          identity.email,
          identity.firstName ?? '',
          identity.lastName ?? '',
          AppRole.Admin,
          organizationId,
        );
      }
    }

    throw new ForbiddenException(
      'Your account has not been provisioned yet — contact your administrator',
    );
  }

  private async syncIdentityFields(
    user: UserDocument,
    payload: KeycloakJwtPayload,
  ): Promise<UserDocument> {
    const identity = this.extractIdentity(payload);
    const updates: Partial<User> = {};

    if (user.email !== identity.email) updates.email = identity.email;
    if (identity.username !== undefined && user.username !== identity.username)
      updates.username = identity.username;
    if (
      identity.firstName !== undefined &&
      user.firstName !== identity.firstName
    )
      updates.firstName = identity.firstName;
    if (identity.lastName !== undefined && user.lastName !== identity.lastName)
      updates.lastName = identity.lastName;

    // Nothing changed — return as-is without a DB write
    if (Object.keys(updates).length === 0) return user;

    return this.userModel
      .findByIdAndUpdate(user._id, { $set: updates }, { new: true })
      .orFail()
      .exec();
  }
}
