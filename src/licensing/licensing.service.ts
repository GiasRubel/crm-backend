import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createHash } from 'crypto';
import { License, LicenseDocument } from './license.schema';
import { ActivateLicenseDto } from './dto/activate-license.dto';

const ENVATO_SALE_LOOKUP_URL = 'https://api.envato.com/v3/market/author/sale';

interface EnvatoSaleResponse {
  item: { id: number };
  buyer: string;
}

/**
 * Envato purchase-code verification (the standard CodeCanyon anti-piracy
 * pattern: https://help.author.envato.com/hc/en-us/articles/360000480926).
 * Verification only happens once, at activation time — the purchase code
 * itself is never persisted (only its hash), so there is nothing to replay
 * against Envato's API later. Once activated, licensing is a local check.
 */
@Injectable()
export class LicensingService implements OnModuleInit {
  private readonly logger = new Logger(LicensingService.name);
  private activated = false;

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(License.name)
    private readonly licenseModel: Model<LicenseDocument>,
  ) {}

  async onModuleInit(): Promise<void> {
    this.activated = (await this.licenseModel.exists({})) !== null;
  }

  isActivated(): boolean {
    return this.activated;
  }

  async activate(dto: ActivateLicenseDto): Promise<{ activated: true }> {
    if (this.activated) {
      throw new ConflictException('This installation is already licensed');
    }

    const token = this.configService.get<string>('ENVATO_PERSONAL_TOKEN');
    const itemId = this.configService.get<string>('ENVATO_ITEM_ID');
    if (!token || !itemId) {
      throw new BadRequestException(
        'Server is missing ENVATO_PERSONAL_TOKEN/ENVATO_ITEM_ID configuration',
      );
    }

    const sale = await this.verifyWithEnvato(dto.purchaseCode, token);
    if (String(sale.item.id) !== String(itemId)) {
      throw new BadRequestException(
        'This purchase code does not belong to this item',
      );
    }

    const purchaseCodeHash = createHash('sha256')
      .update(dto.purchaseCode.trim())
      .digest('hex');

    const existing = await this.licenseModel.findOne({ purchaseCodeHash }).exec();
    if (existing) {
      throw new ConflictException('This purchase code has already been used to activate an installation');
    }

    await this.licenseModel.create({
      purchaseCodeHash,
      envatoItemId: itemId,
      buyerUsername: sale.buyer,
      domain: dto.domain,
      lastVerifiedAt: new Date(),
    });

    this.activated = true;
    this.logger.log(`License activated for buyer ${sale.buyer}`);
    return { activated: true };
  }

  private async verifyWithEnvato(
    purchaseCode: string,
    token: string,
  ): Promise<EnvatoSaleResponse> {
    const url = `${ENVATO_SALE_LOOKUP_URL}?code=${encodeURIComponent(purchaseCode.trim())}`;
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (error) {
      this.logger.error('Envato purchase-code verification request failed:', error);
      throw new BadRequestException('Could not reach Envato to verify the purchase code');
    }

    if (!response.ok) {
      throw new BadRequestException('Invalid purchase code');
    }

    return response.json() as Promise<EnvatoSaleResponse>;
  }
}
