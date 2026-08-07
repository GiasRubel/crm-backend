import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { OrganizationResponseDto } from './dto/organization-response.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { ProvisionOrganizationDto } from './dto/provision-organization.dto';
import { toOrganizationResponseDto } from './mappers/organization.mapper';
import { Organization, OrganizationDocument } from './organization.schema';
import { UsersService } from '../users/users.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { KeycloakAdminService } from '../keycloak-admin/keycloak-admin.service';
import { StripeService } from '../subscriptions/stripe.service';
import { AppRole } from '../users/app-role.enum';
import { OtpService } from '../otp/otp.service';
import { UserDocument } from '../users/users.schema';

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    @InjectModel(Organization.name)
    private readonly organizationModel: Model<OrganizationDocument>,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly keycloakAdminService: KeycloakAdminService,
    private readonly stripeService: StripeService,
    private readonly otpService: OtpService,
  ) {}

  async provision(
    dto: ProvisionOrganizationDto,
  ): Promise<OrganizationResponseDto> {
    const slug = dto.slug.trim().toLowerCase();
    const email = dto.adminEmail.trim().toLowerCase();
    const isLocal = dto.authProvider === 'local';

    // 1. Assert slug is available
    await this.assertSlugAvailable(slug);

    // 2. Assert email is unique in Mongo User collection
    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
    }

    // Pre-generate organization ID so we can set it in User doc
    const organizationId = new Types.ObjectId();

    // 3. Create the identity — Keycloak for SSO orgs, Mongo-only for local-auth orgs
    let keycloakId: string | undefined;
    if (!isLocal) {
      try {
        keycloakId = await this.keycloakAdminService.createUser(
          email,
          dto.adminFirstName.trim(),
          dto.adminLastName.trim(),
        );
      } catch (error) {
        this.logger.error(
          `Failed to create Keycloak user for ${email}:`,
          error,
        );
        throw error;
      }
    }

    let createdUserDoc = false;
    let createdOrgDoc = false;
    let createdSubDoc = false;
    let adminUser: UserDocument | undefined;

    try {
      // 4. Create Mongo User (role Admin, the new organizationId)
      adminUser = isLocal
        ? await this.usersService.createLocalStaffUser(
            email,
            dto.adminFirstName,
            dto.adminLastName,
            AppRole.Admin,
            organizationId,
          )
        : await this.usersService.createUser(
            keycloakId!,
            email,
            dto.adminFirstName,
            dto.adminLastName,
            AppRole.Admin,
            organizationId,
          );
      createdUserDoc = true;

      // 5. Create Organization doc
      const organization = await this.organizationModel.create({
        _id: organizationId,
        name: dto.name.trim(),
        slug,
        status: 'active',
        authProvider: dto.authProvider ?? 'keycloak',
      });
      createdOrgDoc = true;

      // Calculate status and trial period
      const status = dto.planId ? 'incomplete' : 'trialing';
      let currentPeriodEnd: Date | undefined;
      if (status === 'trialing') {
        const days = dto.trialDays ?? 14;
        const end = new Date();
        end.setDate(end.getDate() + days);
        currentPeriodEnd = end;
      }

      // 6. Create Subscription doc
      await this.subscriptionsService.create({
        organizationId: organizationId.toString(),
        stripeCustomerId: 'pending-stripe-customer',
        planId: dto.planId,
        status,
        currentPeriodEnd,
      });
      createdSubDoc = true;

      // Stripe integration (Phase 6)
      if (dto.planId) {
        try {
          const stripeCustomer = await this.stripeService.createCustomer(
            email,
            dto.name.trim(),
          );
          const stripeSubscription =
            (await this.stripeService.createSubscription(
              stripeCustomer.id,
              dto.planId,
              dto.trialDays,
            )) as any;

          // Update subscription doc with real IDs and status from Stripe
          const periodEnd = stripeSubscription.current_period_end
            ? new Date(stripeSubscription.current_period_end * 1000)
            : undefined;

          await this.subscriptionsService.update(organizationId.toString(), {
            stripeCustomerId: stripeCustomer.id,
            stripeSubscriptionId: stripeSubscription.id,
            status: stripeSubscription.status,
            currentPeriodEnd: periodEnd,
          });
        } catch (stripeError) {
          this.logger.error(
            `Failed during Stripe provisioning for ${email}:`,
            stripeError,
          );
          throw stripeError;
        }
      }

      // 7. Send the "set your password" email — Keycloak's flow for SSO
      // orgs, an OTP (completed via POST /auth/password/reset) for local ones
      try {
        if (isLocal) {
          await this.otpService.generateAndSend(adminUser.keycloakId, email);
        } else {
          await this.keycloakAdminService.sendSetPasswordEmail(keycloakId!);
        }
      } catch (emailError) {
        this.logger.error(
          `Organization provisioned successfully, but failed to send the initial set-password email to ${email}:`,
          emailError,
        );
      }

      this.logger.log(
        `Organization provisioned successfully: ${organizationId.toString()} (slug: ${slug})`,
      );
      return toOrganizationResponseDto(organization);
    } catch (error) {
      this.logger.error(
        `Failed to provision organization data in MongoDB. Triggering rollback for Keycloak user ${keycloakId}`,
        error,
      );

      // Rollback database writes in reverse order
      if (createdSubDoc) {
        try {
          await this.subscriptionsService.deleteByOrganizationId(
            organizationId.toString(),
          );
        } catch (subError) {
          this.logger.error(
            `Rollback failure: could not delete subscription for org ${organizationId.toString()}:`,
            subError,
          );
        }
      }
      if (createdOrgDoc) {
        try {
          await this.organizationModel
            .deleteOne({ _id: organizationId })
            .exec();
        } catch (orgError) {
          this.logger.error(
            `Rollback failure: could not delete organization ${organizationId.toString()}:`,
            orgError,
          );
        }
      }
      if (createdUserDoc) {
        try {
          await this.usersService.deleteByKeycloakId(adminUser!.keycloakId);
        } catch (userError) {
          this.logger.error(
            `Rollback failure: could not delete user ${adminUser!.keycloakId}:`,
            userError,
          );
        }
      }

      // Rollback Keycloak user (local-auth orgs never created one)
      if (!isLocal && keycloakId) {
        try {
          await this.keycloakAdminService.deleteUser(keycloakId);
        } catch (kcError) {
          this.logger.error(
            `Rollback critical failure: could not delete Keycloak user ${keycloakId}:`,
            kcError,
          );
        }
      }

      if (
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Failed to provision organization.',
      );
    }
  }

  async create(dto: CreateOrganizationDto): Promise<OrganizationResponseDto> {
    await this.assertSlugAvailable(dto.slug);

    const organization = await this.organizationModel.create({
      name: dto.name.trim(),
      slug: dto.slug.trim().toLowerCase(),
      status: dto.status ?? 'active',
    });

    this.logger.log(`Organization created: ${organization._id.toString()}`);
    return toOrganizationResponseDto(organization);
  }

  async findAll(): Promise<OrganizationResponseDto[]> {
    const organizations = await this.organizationModel
      .find()
      .sort({ createdAt: -1 })
      .exec();
    return organizations.map(toOrganizationResponseDto);
  }

  async findOne(id: string): Promise<OrganizationResponseDto> {
    const organization = await this.findOrgOrThrow(id);
    return toOrganizationResponseDto(organization);
  }

  /** Raw document lookup by slug, for public/unauthenticated routing (e.g. lead capture). */
  async findDocBySlug(slug: string): Promise<OrganizationDocument | null> {
    return this.organizationModel
      .findOne({ slug: slug.trim().toLowerCase(), status: 'active' })
      .exec();
  }

  /** Raw document lookup by id, for internal callers that need `authProvider` (e.g. local auth). */
  async findDocById(
    id: Types.ObjectId | string,
  ): Promise<OrganizationDocument | null> {
    return this.organizationModel.findById(id).exec();
  }

  async update(
    id: string,
    dto: UpdateOrganizationDto,
  ): Promise<OrganizationResponseDto> {
    const organization = await this.findOrgOrThrow(id);

    if (dto.name !== undefined) organization.name = dto.name.trim();
    if (dto.status !== undefined) organization.status = dto.status;
    if (dto.authProvider !== undefined)
      organization.authProvider = dto.authProvider;

    await organization.save();
    return toOrganizationResponseDto(organization);
  }

  private async findOrgOrThrow(id: string): Promise<OrganizationDocument> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException('Organization not found');
    }
    const organization = await this.organizationModel.findById(id).exec();
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }
    return organization;
  }

  private async assertSlugAvailable(slug: string): Promise<void> {
    const existing = await this.organizationModel
      .findOne({ slug: slug.trim().toLowerCase() })
      .exec();
    if (existing) {
      throw new ConflictException(
        'An organization with this slug already exists',
      );
    }
  }
}
