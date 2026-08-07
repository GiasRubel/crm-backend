import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { Account, AccountDocument } from '../accounts/account.schema';
import { AuditActor, AuditService } from '../audit/audit.service';
import { Contact, ContactDocument } from '../contacts/contact.schema';
import { Customer, CustomerDocument } from '../customers/customer.schema';
import { Lead, LeadDocument } from '../leads/lead.schema';
import {
  Opportunity,
  OpportunityDocument,
} from '../opportunities/opportunity.schema';
import { Ticket, TicketDocument } from '../tickets/ticket.schema';
import { AppRole } from '../users/app-role.enum';
import { UsersService } from '../users/users.service';
import {
  Attachment,
  AttachmentDocument,
  AttachmentEntityType,
} from './attachment.schema';
import { AttachmentResponseDto } from './dto/attachment-response.dto';
import { toAttachmentResponseDto } from './mappers/attachment.mapper';

/** Bytes stored on disk are never re-derived from user input — this is the only path builder. */
export interface StoredFile {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  size: number;
}

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);
  private readonly uploadsDir: string;

  constructor(
    @InjectModel(Attachment.name)
    private readonly attachmentModel: Model<AttachmentDocument>,
    @InjectModel(Lead.name) private readonly leadModel: Model<LeadDocument>,
    @InjectModel(Contact.name)
    private readonly contactModel: Model<ContactDocument>,
    @InjectModel(Account.name)
    private readonly accountModel: Model<AccountDocument>,
    @InjectModel(Opportunity.name)
    private readonly opportunityModel: Model<OpportunityDocument>,
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
    @InjectModel(Ticket.name)
    private readonly ticketModel: Model<TicketDocument>,
    private readonly usersService: UsersService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {
    this.uploadsDir = path.resolve(
      this.configService.get<string>('UPLOADS_DIR', './uploads'),
    );
  }

  /** Read/existence-check-only access to the collections a file may be attached to. */
  private modelFor(
    entityType: AttachmentEntityType,
  ): Model<{ _id: Types.ObjectId }> {
    const models: Record<
      AttachmentEntityType,
      Model<{ _id: Types.ObjectId }>
    > = {
      lead: this.leadModel,
      contact: this.contactModel,
      account: this.accountModel,
      opportunity: this.opportunityModel,
      customer: this.customerModel,
      ticket: this.ticketModel,
    };
    return models[entityType];
  }

  async upload(
    entityType: AttachmentEntityType,
    entityId: string,
    file: StoredFile,
    actor: AuditActor,
    organizationId: Types.ObjectId,
  ): Promise<AttachmentResponseDto> {
    if (!isValidObjectId(entityId)) {
      throw new BadRequestException('Invalid record id');
    }
    const exists = await this.modelFor(entityType)
      .exists({ _id: entityId, organizationId })
      .exec();
    if (!exists) {
      throw new NotFoundException(
        `${entityType} with ID ${entityId} not found`,
      );
    }

    const originalName = path.basename(file.originalName).slice(0, 255);
    const extension = path.extname(originalName);
    const storedName = `${randomUUID()}${extension}`;
    const dir = path.join(
      this.uploadsDir,
      organizationId.toString(),
      entityType,
      entityId,
    );
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, storedName), file.buffer);

    const attachment = await this.attachmentModel.create({
      organizationId,
      entityType,
      entityId: new Types.ObjectId(entityId),
      originalName,
      storedName,
      mimeType: file.mimeType,
      size: file.size,
      uploadedBy: actor.id,
    });

    this.logger.log(
      `Attachment uploaded: ${originalName} on ${entityType} ${entityId}`,
    );
    void this.auditService.log({
      organizationId,
      actor,
      action: 'create',
      entityType: 'attachment',
      entityId: attachment._id.toString(),
      entityLabel: originalName,
      summary: `Uploaded "${originalName}" to ${entityType} ${entityId}`,
    });

    return this.mapOne(attachment);
  }

  async findAllForEntity(
    entityType: AttachmentEntityType,
    entityId: string,
    organizationId: Types.ObjectId,
  ): Promise<AttachmentResponseDto[]> {
    if (!isValidObjectId(entityId)) return [];
    const attachments = await this.attachmentModel
      .find({ organizationId, entityType, entityId })
      .sort({ createdAt: -1 })
      .exec();
    return this.mapMany(attachments);
  }

  /** Resolves the on-disk path for a download, 404ing on any mismatch (missing DB row, missing file, wrong org). */
  async getFileOrFail(
    id: string,
    organizationId: Types.ObjectId,
  ): Promise<{ attachment: AttachmentDocument; absolutePath: string }> {
    const attachment = await this.getByIdOrFail(id, organizationId);
    const absolutePath = path.join(
      this.uploadsDir,
      organizationId.toString(),
      attachment.entityType,
      attachment.entityId.toString(),
      attachment.storedName,
    );
    try {
      await fs.access(absolutePath);
    } catch {
      throw new NotFoundException('Attachment file is missing from storage');
    }
    return { attachment, absolutePath };
  }

  async remove(
    id: string,
    actor: AuditActor,
    organizationId: Types.ObjectId,
  ): Promise<void> {
    const attachment = await this.getByIdOrFail(id, organizationId);
    const isOwner = attachment.uploadedBy === actor.id;
    if (!isOwner) {
      const appUser = actor.id
        ? await this.usersService.findByKeycloakId(actor.id)
        : null;
      const isAdmin =
        appUser?.role === AppRole.Admin ||
        appUser?.role === AppRole.Administrator;
      if (!isAdmin) {
        throw new ForbiddenException(
          'Only the uploader or an administrator can delete this attachment',
        );
      }
    }

    const absolutePath = path.join(
      this.uploadsDir,
      organizationId.toString(),
      attachment.entityType,
      attachment.entityId.toString(),
      attachment.storedName,
    );
    await fs.unlink(absolutePath).catch(() => undefined);
    await this.attachmentModel.deleteOne({ _id: attachment._id }).exec();

    this.logger.log(`Attachment deleted: ${attachment.originalName}`);
    void this.auditService.log({
      organizationId,
      actor,
      action: 'delete',
      entityType: 'attachment',
      entityId: id,
      entityLabel: attachment.originalName,
      summary: `Deleted "${attachment.originalName}" from ${attachment.entityType} ${attachment.entityId.toString()}`,
    });
  }

  private async getByIdOrFail(
    id: string,
    organizationId: Types.ObjectId,
  ): Promise<AttachmentDocument> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Attachment with ID ${id} not found`);
    }
    const attachment = await this.attachmentModel
      .findOne({ _id: id, organizationId })
      .exec();
    if (!attachment) {
      throw new NotFoundException(`Attachment with ID ${id} not found`);
    }
    return attachment;
  }

  private async mapOne(
    attachment: AttachmentDocument,
  ): Promise<AttachmentResponseDto> {
    const [dto] = await this.mapMany([attachment]);
    return dto;
  }

  private async mapMany(
    attachments: AttachmentDocument[],
  ): Promise<AttachmentResponseDto[]> {
    if (attachments.length === 0) return [];
    const staffIds = [...new Set(attachments.map((a) => a.uploadedBy))];
    const staff = await this.usersService.findStaffByKeycloakIds(staffIds);
    const uploaderNames = new Map(
      staff.map((u) => [
        u.keycloakId,
        `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email,
      ]),
    );
    return attachments.map((a) => toAttachmentResponseDto(a, uploaderNames));
  }
}
