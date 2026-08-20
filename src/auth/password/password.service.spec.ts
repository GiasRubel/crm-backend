import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { PasswordService } from './password.service';

function buildUser(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    organizationId: new Types.ObjectId(),
    keycloakId: 'kc-1',
    email: 'known@acme.example',
    ...overrides,
  };
}

describe('PasswordService', () => {
  let usersService: { findByEmail: jest.Mock };
  let otpService: { generateAndSend: jest.Mock; verify: jest.Mock };
  let keycloakAdminService: { resetPassword: jest.Mock };
  let organizationsService: { findDocById: jest.Mock };
  let localAuthService: { setPassword: jest.Mock };
  let service: PasswordService;

  beforeEach(() => {
    usersService = { findByEmail: jest.fn() };
    otpService = { generateAndSend: jest.fn(), verify: jest.fn() };
    keycloakAdminService = { resetPassword: jest.fn() };
    organizationsService = {
      findDocById: jest.fn().mockResolvedValue({ authProvider: 'keycloak' }),
    };
    localAuthService = { setPassword: jest.fn() };

    service = new PasswordService(
      usersService as any,
      otpService as any,
      keycloakAdminService as any,
      organizationsService as any,
      localAuthService as any,
      { log: jest.fn() } as any,
    );
  });

  describe('sendForgotPasswordOtp', () => {
    it('sends an OTP for a known address', async () => {
      const user = buildUser();
      usersService.findByEmail.mockResolvedValue(user);

      await service.sendForgotPasswordOtp('known@acme.example');

      expect(otpService.generateAndSend).toHaveBeenCalledWith(
        'kc-1',
        'known@acme.example',
        user.organizationId,
      );
    });

    it('returns the identical message for an unknown address, and sends nothing', async () => {
      const known = await (async () => {
        usersService.findByEmail.mockResolvedValue(buildUser());
        return service.sendForgotPasswordOtp('known@acme.example');
      })();

      usersService.findByEmail.mockResolvedValue(null);
      otpService.generateAndSend.mockClear();
      const unknown = await service.sendForgotPasswordOtp(
        'nobody@acme.example',
      );

      expect(unknown).toEqual(known);
      expect(otpService.generateAndSend).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword — user enumeration', () => {
    /**
     * The unknown-address branch used to answer "No account found for this
     * email address", which made this endpoint a free enumeration oracle. Both
     * branches must now be indistinguishable to the caller.
     */
    it('gives an unknown address the same error as a wrong code', async () => {
      usersService.findByEmail.mockResolvedValue(buildUser());
      otpService.verify.mockRejectedValue(
        new BadRequestException(
          'That reset code is invalid or has expired. Please request a new one.',
        ),
      );
      const wrongCode = await service
        .resetPassword('known@acme.example', '000000', 'NewPassw0rd!')
        .catch((error: Error) => error);

      usersService.findByEmail.mockResolvedValue(null);
      const unknownEmail = await service
        .resetPassword('nobody@acme.example', '000000', 'NewPassw0rd!')
        .catch((error: Error) => error);

      expect(unknownEmail).toBeInstanceOf(BadRequestException);
      expect((unknownEmail as Error).message).toBe(
        (wrongCode as Error).message,
      );
    });

    it('does not mention accounts, existence, or the address in the message', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.resetPassword('nobody@acme.example', '123456', 'NewPassw0rd!'),
      ).rejects.toThrow(/^That reset code is invalid or has expired\./);
    });

    it('never touches the password backends for an unknown address', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.resetPassword('nobody@acme.example', '123456', 'NewPassw0rd!'),
      ).rejects.toThrow(BadRequestException);

      expect(otpService.verify).not.toHaveBeenCalled();
      expect(keycloakAdminService.resetPassword).not.toHaveBeenCalled();
      expect(localAuthService.setPassword).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword — happy paths', () => {
    it('resets through Keycloak for a keycloak-mode org', async () => {
      usersService.findByEmail.mockResolvedValue(buildUser());

      await service.resetPassword(
        'known@acme.example',
        '123456',
        'NewPassw0rd!',
      );

      expect(otpService.verify).toHaveBeenCalledWith('kc-1', '123456');
      expect(keycloakAdminService.resetPassword).toHaveBeenCalledWith(
        'kc-1',
        'NewPassw0rd!',
      );
      expect(localAuthService.setPassword).not.toHaveBeenCalled();
    });

    it('resets in the database for a local-auth org', async () => {
      const user = buildUser();
      usersService.findByEmail.mockResolvedValue(user);
      organizationsService.findDocById.mockResolvedValue({
        authProvider: 'local',
      });

      await service.resetPassword(
        'known@acme.example',
        '123456',
        'NewPassw0rd!',
      );

      expect(localAuthService.setPassword).toHaveBeenCalledWith(
        user._id,
        'NewPassw0rd!',
      );
      expect(keycloakAdminService.resetPassword).not.toHaveBeenCalled();
    });
  });
});
