import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { KeycloakAdminService } from '../keycloak-admin/keycloak-admin.service';
import { UsersService } from '../users/users.service';
import { Customer, CustomerDocument } from './customer.schema';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { CustomerResponseDto } from './dto/customer-response.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { toCustomerResponseDto } from './mappers/customer.mapper';

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    @InjectModel(Customer.name) private readonly customerModel: Model<CustomerDocument>,
    private readonly usersService: UsersService,
    private readonly keycloakAdminService: KeycloakAdminService,
  ) {}

  async create(dto: CreateCustomerDto, createdBy: string): Promise<CustomerResponseDto> {
    const email = dto.email.trim().toLowerCase();

    // 1. Verify email uniqueness in MongoDB collections
    const existingCustomer = await this.customerModel.findOne({ email }).exec();
    if (existingCustomer) {
      throw new ConflictException('A customer with this email already exists');
    }

    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
    }

    // 2. Create user in Keycloak identity provider
    let keycloakId: string;
    try {
      keycloakId = await this.keycloakAdminService.createUser(
        email,
        dto.firstName.trim(),
        dto.lastName.trim(),
      );
    } catch (error) {
      this.logger.error(`Failed to create Keycloak user for ${email}:`, error);
      throw error;
    }

    // 3. Provision MongoDB collections (User and Customer) with rollback protection
    let createdUserDoc = false;
    let createdCustomerDoc: CustomerDocument | null = null;

    try {
      // Create user document with Customer role
      await this.usersService.createCustomerUser(
        keycloakId,
        email,
        dto.firstName,
        dto.lastName,
      );
      createdUserDoc = true;

      // Create detailed customer profile document
      createdCustomerDoc = await this.customerModel.create({
        keycloakId,
        email,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phone: dto.phone.trim(),
        company: dto.company?.trim(),
        address: dto.address?.trim(),
        notes: dto.notes?.trim(),
        status: dto.status ?? 'active',
        createdBy,
      });

      // 4. Send action invitation email via Keycloak
      try {
        await this.keycloakAdminService.sendSetPasswordEmail(keycloakId);
      } catch (emailError) {
        this.logger.error(
          `Customer created successfully, but Keycloak failed to send the initial invitation email to ${email}:`,
          emailError,
        );
      }

      return toCustomerResponseDto(createdCustomerDoc);
    } catch (error) {
      this.logger.error(
        `Failed to write customer data to MongoDB. Triggering rollback for Keycloak user ${keycloakId}`,
        error,
      );

      // Rollback database writes if any succeeded
      if (createdCustomerDoc) {
        await this.customerModel.deleteOne({ _id: createdCustomerDoc._id }).exec();
      }
      if (createdUserDoc) {
        await this.usersService.deleteByKeycloakId(keycloakId);
      }

      // Rollback Keycloak user creation
      try {
        await this.keycloakAdminService.deleteUser(keycloakId);
      } catch (kcError) {
        this.logger.error(`Rollback critical failure: could not delete Keycloak user ${keycloakId}:`, kcError);
      }

      if (error instanceof ConflictException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to create customer profile.');
    }
  }

  async findAll(query: CustomerQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const filter: any = {};

    if (query.search) {
      const searchRegex = new RegExp(query.search.trim(), 'i');
      filter.$or = [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { email: searchRegex },
        { company: searchRegex },
        { phone: searchRegex },
      ];
    }

    if (query.status) {
      filter.status = query.status;
    }

    const [items, total] = await Promise.all([
      this.customerModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.customerModel.countDocuments(filter).exec(),
    ]);

    return {
      data: items.map(toCustomerResponseDto),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string): Promise<CustomerResponseDto> {
    const customer = await this.customerModel.findById(id).exec();
    if (!customer) {
      throw new NotFoundException(`Customer with ID ${id} not found`);
    }
    return toCustomerResponseDto(customer);
  }

  async update(id: string, dto: UpdateCustomerDto): Promise<CustomerResponseDto> {
    const customer = await this.customerModel.findById(id).exec();
    if (!customer) {
      throw new NotFoundException(`Customer with ID ${id} not found`);
    }

    const updates: Partial<Customer> = {};
    const userUpdates: any = {};
    const keycloakUpdates: any = {};

    let emailChanged = false;
    let nameChanged = false;

    if (dto.email !== undefined) {
      const newEmail = dto.email.trim().toLowerCase();
      if (newEmail !== customer.email) {
        // Validate email uniqueness
        const existingCustomer = await this.customerModel.findOne({ email: newEmail }).exec();
        if (existingCustomer) {
          throw new ConflictException('A customer with this email already exists');
        }
        const existingUser = await this.usersService.findByEmail(newEmail);
        if (existingUser && existingUser.keycloakId !== customer.keycloakId) {
          throw new ConflictException('A user with this email already exists');
        }

        updates.email = newEmail;
        userUpdates.email = newEmail;
        keycloakUpdates.email = newEmail;
        emailChanged = true;
      }
    }

    if (dto.firstName !== undefined) {
      const newFirst = dto.firstName.trim();
      if (newFirst !== customer.firstName) {
        updates.firstName = newFirst;
        userUpdates.firstName = newFirst;
        keycloakUpdates.firstName = newFirst;
        nameChanged = true;
      }
    }

    if (dto.lastName !== undefined) {
      const newLast = dto.lastName.trim();
      if (newLast !== customer.lastName) {
        updates.lastName = newLast;
        userUpdates.lastName = newLast;
        keycloakUpdates.lastName = newLast;
        nameChanged = true;
      }
    }

    if (dto.phone !== undefined) updates.phone = dto.phone.trim();
    if (dto.company !== undefined) updates.company = dto.company.trim();
    if (dto.address !== undefined) updates.address = dto.address.trim();
    if (dto.notes !== undefined) updates.notes = dto.notes.trim();
    if (dto.status !== undefined) updates.status = dto.status;

    // 1. Sync profile fields to Keycloak Identity Provider
    if (emailChanged || nameChanged) {
      try {
        await this.keycloakAdminService.updateUser(customer.keycloakId, keycloakUpdates);
      } catch (error) {
        this.logger.error(`Failed to update Keycloak user identity ${customer.keycloakId}:`, error);
        throw error;
      }
    }

    // 2. Sync profile fields to MongoDB User collection
    if (Object.keys(userUpdates).length > 0) {
      const userDoc = await this.usersService.findByKeycloakId(customer.keycloakId);
      if (userDoc) {
        Object.assign(userDoc, userUpdates);
        await userDoc.save();
      }
    }

    // 3. Sync profile fields to MongoDB Customer collection
    const updatedCustomer = await this.customerModel
      .findByIdAndUpdate(id, { $set: updates }, { new: true })
      .orFail()
      .exec();

    this.logger.log(`Customer profile updated: ${id}`);
    return toCustomerResponseDto(updatedCustomer);
  }

  async remove(id: string): Promise<void> {
    const customer = await this.customerModel.findById(id).exec();
    if (!customer) {
      throw new NotFoundException(`Customer with ID ${id} not found`);
    }

    // 1. Delete in Keycloak
    try {
      await this.keycloakAdminService.deleteUser(customer.keycloakId);
    } catch (error) {
      this.logger.error(`Failed to delete Keycloak user ${customer.keycloakId}:`, error);
    }

    // 2. Delete MongoDB user
    await this.usersService.deleteByKeycloakId(customer.keycloakId);

    // 3. Delete MongoDB customer
    await this.customerModel.deleteOne({ _id: id }).exec();

    this.logger.log(`Customer deleted: ${id}`);
  }

  async resendInvitation(id: string): Promise<void> {
    const customer = await this.customerModel.findById(id).exec();
    if (!customer) {
      throw new NotFoundException(`Customer with ID ${id} not found`);
    }
    await this.keycloakAdminService.sendSetPasswordEmail(customer.keycloakId);
    this.logger.log(`Resent password setup email to customer ${customer.email}`);
  }
}
