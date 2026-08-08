import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import * as nodemailer from 'nodemailer';
import { MailSettingsService } from './mail-settings.service';
import { decryptSecret, deriveMailEncryptionKey, encryptSecret } from './crypto.util';

jest.mock('nodemailer');

function buildConfigService(): ConfigService {
  return { get: jest.fn(() => 'test-secret') } as unknown as ConfigService;
}

function buildAuditService() {
  return { log: jest.fn() };
}

const encKey = deriveMailEncryptionKey('test-secret');

function buildSettingsDoc(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: new Types.ObjectId(),
    enabled: false,
    secure: false,
    save: jest.fn(),
    toObject: jest.fn(function (this: Record<string, unknown>) {
      return { ...this };
    }),
    ...overrides,
  };
}

describe('MailSettingsService', () => {
  let model: any;
  let auditService: ReturnType<typeof buildAuditService>;
  let service: MailSettingsService;

  beforeEach(() => {
    jest.clearAllMocks();
    model = jest.fn().mockImplementation((doc) => buildSettingsDoc(doc));
    model.findOne = jest.fn();
    auditService = buildAuditService();
    service = new MailSettingsService(
      model,
      buildConfigService(),
      auditService as any,
    );
  });

  describe('getResponse', () => {
    it('returns a disabled empty response when nothing is configured', async () => {
      model.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      const result = await service.getResponse(new Types.ObjectId());
      expect(result).toEqual({ enabled: false, secure: false, hasPassword: false });
    });

    it('never leaks the encrypted password, only a hasPassword flag', async () => {
      const doc = buildSettingsDoc({
        enabled: true,
        host: 'smtp.test.com',
        encryptedPass: encryptSecret('super-secret', encKey),
      });
      model.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(doc) });
      const result = await service.getResponse(doc.organizationId);
      expect(result.hasPassword).toBe(true);
      expect(result).not.toHaveProperty('pass');
      expect(result).not.toHaveProperty('encryptedPass');
    });
  });

  describe('update', () => {
    it('creates a new settings doc, encrypts the password, and audits the change', async () => {
      model.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      const orgId = new Types.ObjectId();

      const result = await service.update(
        orgId,
        {
          enabled: true,
          host: 'smtp.test.com',
          port: 587,
          user: 'user@test.com',
          pass: 'super-secret',
          fromAddress: 'noreply@test.com',
        },
        { id: 'actor-1' },
      );

      expect(result.hasPassword).toBe(true);
      expect(result.host).toBe('smtp.test.com');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'create', entityType: 'mail_settings' }),
      );
    });

    it('keeps the previously saved password when pass is omitted', async () => {
      const existingEncrypted = encryptSecret('old-secret', encKey);
      const doc = buildSettingsDoc({
        enabled: true,
        host: 'smtp.test.com',
        user: 'user@test.com',
        fromAddress: 'noreply@test.com',
        encryptedPass: existingEncrypted,
      });
      model.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(doc) });

      await service.update(
        doc.organizationId,
        { fromName: 'Updated Name' },
        { id: 'actor-1' },
      );

      expect(doc.encryptedPass).toBe(existingEncrypted);
      expect(decryptSecret(doc.encryptedPass, encKey)).toBe('old-secret');
    });

    it('rejects enabling without host/user/password/fromAddress', async () => {
      model.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

      await expect(
        service.update(
          new Types.ObjectId(),
          { enabled: true },
          { id: 'actor-1' },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('sendTest', () => {
    it('throws when custom SMTP is not enabled/configured', async () => {
      model.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      await expect(
        service.sendTest(new Types.ObjectId(), 'to@test.com'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('sends a test email through a transporter built from the saved config', async () => {
      const doc = buildSettingsDoc({
        enabled: true,
        host: 'smtp.test.com',
        port: 587,
        user: 'user@test.com',
        fromAddress: 'noreply@test.com',
        fromName: 'Test Co',
        encryptedPass: encryptSecret('super-secret', encKey),
      });
      model.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(doc) });
      const sendMail = jest.fn().mockResolvedValue(undefined);
      (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });

      await service.sendTest(doc.organizationId, 'to@test.com');

      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.test.com',
          auth: { user: 'user@test.com', pass: 'super-secret' },
        }),
      );
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'to@test.com' }),
      );
    });

    it('wraps a transporter failure in a BadRequestException', async () => {
      const doc = buildSettingsDoc({
        enabled: true,
        host: 'smtp.test.com',
        user: 'user@test.com',
        fromAddress: 'noreply@test.com',
        encryptedPass: encryptSecret('super-secret', encKey),
      });
      model.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(doc) });
      const sendMail = jest.fn().mockRejectedValue(new Error('auth failed'));
      (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });

      await expect(
        service.sendTest(doc.organizationId, 'to@test.com'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
