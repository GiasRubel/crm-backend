import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LicensingService } from './licensing.service';

describe('LicensingService', () => {
  let configService: jest.Mocked<ConfigService>;
  let licenseModel: any;
  let service: LicensingService;
  let fetchSpy: jest.SpyInstance;

  const buildDto = () => ({ purchaseCode: '  abc-123  ', domain: 'example.com' });

  beforeEach(() => {
    configService = { get: jest.fn() } as unknown as jest.Mocked<ConfigService>;
    licenseModel = {
      exists: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
    };
    service = new LicensingService(configService, licenseModel);
    fetchSpy = jest.spyOn(global, 'fetch' as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('onModuleInit / isActivated', () => {
    it('is activated when a license document already exists', async () => {
      licenseModel.exists.mockResolvedValue({ _id: 'x' });

      await service.onModuleInit();

      expect(service.isActivated()).toBe(true);
    });

    it('is not activated when no license document exists', async () => {
      licenseModel.exists.mockResolvedValue(null);

      await service.onModuleInit();

      expect(service.isActivated()).toBe(false);
    });
  });

  describe('activate', () => {
    it('rejects if already activated', async () => {
      licenseModel.exists.mockResolvedValue({ _id: 'x' });
      await service.onModuleInit();

      await expect(service.activate(buildDto() as any)).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects when Envato credentials are not configured', async () => {
      licenseModel.exists.mockResolvedValue(null);
      await service.onModuleInit();
      configService.get.mockReturnValue(undefined);

      await expect(service.activate(buildDto() as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects when the purchase code belongs to a different item', async () => {
      licenseModel.exists.mockResolvedValue(null);
      await service.onModuleInit();
      configService.get.mockImplementation((key: string) =>
        ({ ENVATO_PERSONAL_TOKEN: 'token', ENVATO_ITEM_ID: '111' })[key],
      );
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ item: { id: 222 }, buyer: 'bob' }),
      } as any);

      await expect(service.activate(buildDto() as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects when Envato reports the code as invalid', async () => {
      licenseModel.exists.mockResolvedValue(null);
      await service.onModuleInit();
      configService.get.mockImplementation((key: string) =>
        ({ ENVATO_PERSONAL_TOKEN: 'token', ENVATO_ITEM_ID: '111' })[key],
      );
      fetchSpy.mockResolvedValue({ ok: false } as any);

      await expect(service.activate(buildDto() as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects when the network call to Envato fails', async () => {
      licenseModel.exists.mockResolvedValue(null);
      await service.onModuleInit();
      configService.get.mockImplementation((key: string) =>
        ({ ENVATO_PERSONAL_TOKEN: 'token', ENVATO_ITEM_ID: '111' })[key],
      );
      fetchSpy.mockRejectedValue(new Error('network down'));

      await expect(service.activate(buildDto() as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects when the purchase code hash was already used', async () => {
      licenseModel.exists.mockResolvedValue(null);
      await service.onModuleInit();
      configService.get.mockImplementation((key: string) =>
        ({ ENVATO_PERSONAL_TOKEN: 'token', ENVATO_ITEM_ID: '111' })[key],
      );
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ item: { id: 111 }, buyer: 'bob' }),
      } as any);
      licenseModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: 'existing' }),
      });

      await expect(service.activate(buildDto() as any)).rejects.toThrow(
        ConflictException,
      );
    });

    it('activates and persists the license on a valid, unused purchase code', async () => {
      licenseModel.exists.mockResolvedValue(null);
      await service.onModuleInit();
      configService.get.mockImplementation((key: string) =>
        ({ ENVATO_PERSONAL_TOKEN: 'token', ENVATO_ITEM_ID: '111' })[key],
      );
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ item: { id: 111 }, buyer: 'bob' }),
      } as any);
      licenseModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      licenseModel.create.mockResolvedValue({});

      const result = await service.activate(buildDto() as any);

      expect(result).toEqual({ activated: true });
      expect(service.isActivated()).toBe(true);
      expect(licenseModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          envatoItemId: '111',
          buyerUsername: 'bob',
          domain: 'example.com',
        }),
      );
    });
  });
});
