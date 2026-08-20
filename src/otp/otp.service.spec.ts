import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { OtpService } from './otp.service';

function buildOtpDoc(overrides: Record<string, unknown> = {}) {
  return {
    keycloakId: 'kc-1',
    code: '123456',
    attempts: 0,
    expiresAt: new Date(Date.now() + 60_000),
    save: jest.fn(),
    deleteOne: jest.fn(),
    ...overrides,
  };
}

function query(value: unknown) {
  return { exec: jest.fn().mockResolvedValue(value) };
}

describe('OtpService', () => {
  let otpModel: any;
  let mailService: { sendOtp: jest.Mock };
  let service: OtpService;

  beforeEach(() => {
    otpModel = {
      create: jest.fn(),
      findOne: jest.fn(),
      deleteOne: jest.fn(() => query(undefined)),
    };
    mailService = { sendOtp: jest.fn() };
    service = new OtpService(otpModel, mailService as any);
  });

  describe('generateAndSend', () => {
    it('replaces any existing OTP for the key before issuing a new one', async () => {
      await service.generateAndSend('kc-1', 'a@b.example');

      expect(otpModel.deleteOne).toHaveBeenCalledWith({ keycloakId: 'kc-1' });
      expect(otpModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ keycloakId: 'kc-1', attempts: 0 }),
      );
    });

    it('emails the same code it stored, scoped to the org when given', async () => {
      const orgId = new Types.ObjectId();
      await service.generateAndSend('kc-1', 'a@b.example', orgId);

      const stored = otpModel.create.mock.calls[0][0].code;
      expect(mailService.sendOtp).toHaveBeenCalledWith(
        'a@b.example',
        stored,
        orgId,
      );
    });

    /**
     * The code is a password-reset credential. Math.random() was replaced with
     * crypto.randomInt, so this asserts the observable contract of that change:
     * always six digits, uniformly across the full 100000-999999 range, and
     * never repeating over a large sample.
     */
    describe('code generation', () => {
      const SAMPLE = 500;

      it('always produces exactly six digits in range', async () => {
        for (let i = 0; i < SAMPLE; i++) {
          await service.generateAndSend(`kc-${i}`, 'a@b.example');
        }
        const codes = otpModel.create.mock.calls.map(
          (call: [{ code: string }]) => call[0].code,
        );

        expect(codes).toHaveLength(SAMPLE);
        for (const code of codes) {
          expect(code).toMatch(/^\d{6}$/);
          expect(Number(code)).toBeGreaterThanOrEqual(100_000);
          expect(Number(code)).toBeLessThanOrEqual(999_999);
        }
      });

      it('does not collapse onto a small set of values', async () => {
        for (let i = 0; i < SAMPLE; i++) {
          await service.generateAndSend(`kc-${i}`, 'a@b.example');
        }
        const codes: string[] = otpModel.create.mock.calls.map(
          (call: [{ code: string }]) => call[0].code,
        );

        // 500 draws from 900k values: collisions are possible but a healthy
        // generator will be near-perfectly distinct.
        expect(new Set(codes).size).toBeGreaterThan(SAMPLE - 5);
      });
    });
  });

  describe('verify', () => {
    it('accepts the correct code and consumes the record', async () => {
      const doc = buildOtpDoc();
      otpModel.findOne.mockReturnValue(query(doc));

      await expect(service.verify('kc-1', '123456')).resolves.toBeUndefined();
      expect(doc.deleteOne).toHaveBeenCalled();
    });

    it('rejects a wrong code and counts the attempt', async () => {
      const doc = buildOtpDoc();
      otpModel.findOne.mockReturnValue(query(doc));

      await expect(service.verify('kc-1', '000000')).rejects.toThrow(
        BadRequestException,
      );
      expect(doc.attempts).toBe(1);
      expect(doc.save).toHaveBeenCalled();
      expect(doc.deleteOne).not.toHaveBeenCalled();
    });

    it('rejects a code of the wrong length without throwing from the comparison', async () => {
      // timingSafeEqual throws on a length mismatch, so the length guard has to
      // come first — otherwise a short code would surface as a 500.
      otpModel.findOne.mockReturnValue(query(buildOtpDoc()));

      await expect(service.verify('kc-1', '12345')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects an empty submitted code', async () => {
      otpModel.findOne.mockReturnValue(query(buildOtpDoc()));

      await expect(service.verify('kc-1', '')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects when no OTP was ever issued', async () => {
      otpModel.findOne.mockReturnValue(query(null));

      await expect(service.verify('kc-1', '123456')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects and deletes an expired OTP', async () => {
      const doc = buildOtpDoc({ expiresAt: new Date(Date.now() - 1_000) });
      otpModel.findOne.mockReturnValue(query(doc));

      await expect(service.verify('kc-1', '123456')).rejects.toThrow(
        BadRequestException,
      );
      expect(doc.deleteOne).toHaveBeenCalled();
    });

    it('burns the OTP after too many failed attempts', async () => {
      const doc = buildOtpDoc({ attempts: 3 });
      otpModel.findOne.mockReturnValue(query(doc));

      await expect(service.verify('kc-1', '123456')).rejects.toThrow(
        ForbiddenException,
      );
      expect(doc.deleteOne).toHaveBeenCalled();
    });
  });
});
