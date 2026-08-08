import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { CalendarSyncService } from './calendar-sync.service';
import { deriveCalendarEncryptionKey, encryptToken } from './token-crypto.util';

function buildConfigService(): ConfigService {
  const values: Record<string, string> = {
    FRONTEND_URL: 'https://app.test',
    CALENDAR_TOKEN_ENCRYPTION_KEY: 'test-secret',
  };
  return {
    get: jest.fn((key: string) => values[key]),
    getOrThrow: jest.fn((key: string) => {
      if (!values[key]) throw new Error(`missing ${key}`);
      return values[key];
    }),
  } as unknown as ConfigService;
}

function buildProviderMock() {
  return {
    buildAuthorizeUrl: jest.fn(() => 'https://provider.test/authorize'),
    exchangeCode: jest.fn(),
    refreshAccessToken: jest.fn(),
    getAccountEmail: jest.fn(),
    listChanges: jest.fn(),
    createEvent: jest.fn(),
    updateEvent: jest.fn(),
    deleteEvent: jest.fn(),
  };
}

const encKey = deriveCalendarEncryptionKey('test-secret');

function buildConnection(overrides: Record<string, unknown> = {}) {
  const doc = {
    _id: new Types.ObjectId(),
    organizationId: new Types.ObjectId(),
    userId: 'user-1',
    provider: 'google' as const,
    accessTokenEnc: encryptToken('valid-access-token', encKey),
    refreshTokenEnc: encryptToken('valid-refresh-token', encKey),
    tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    status: 'active' as const,
    save: jest.fn(),
    ...overrides,
  };
  return doc;
}

function buildActivity(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    organizationId: new Types.ObjectId(),
    type: 'meeting',
    subject: 'Sync call',
    description: 'agenda',
    startAt: new Date('2026-08-10T10:00:00Z'),
    endAt: new Date('2026-08-10T10:30:00Z'),
    assignedToId: 'user-1',
    updatedAt: new Date(),
    save: jest.fn(),
    ...overrides,
  } as any;
}

describe('CalendarSyncService', () => {
  let connectionModel: any;
  let stateModel: any;
  let activityModel: any;
  let googleProvider: ReturnType<typeof buildProviderMock>;
  let microsoftProvider: ReturnType<typeof buildProviderMock>;
  let service: CalendarSyncService;

  beforeEach(() => {
    connectionModel = {
      create: jest.fn(),
      findOne: jest.fn(),
      findById: jest.fn(),
      findOneAndUpdate: jest.fn(),
      find: jest.fn(),
      deleteOne: jest.fn(() => ({ exec: jest.fn() })),
    };
    stateModel = {
      create: jest.fn(),
      findOneAndDelete: jest.fn(),
    };
    activityModel = {
      create: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
    };
    googleProvider = buildProviderMock();
    microsoftProvider = buildProviderMock();

    service = new CalendarSyncService(
      connectionModel,
      stateModel,
      activityModel,
      buildConfigService(),
      googleProvider as any,
      microsoftProvider as any,
    );
  });

  describe('getAuthorizeUrl', () => {
    it('persists a state doc and returns the provider authorize URL', async () => {
      const orgId = new Types.ObjectId();
      const result = await service.getAuthorizeUrl('google', 'user-1', orgId);

      expect(stateModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          provider: 'google',
          organizationId: orgId,
        }),
      );
      expect(googleProvider.buildAuthorizeUrl).toHaveBeenCalledWith(
        'https://app.test/api/backend/calendar-sync/google/callback',
        expect.any(String),
      );
      expect(result).toEqual({ url: 'https://provider.test/authorize' });
    });
  });

  describe('handleCallback', () => {
    it('redirects with an error when the provider reports one', async () => {
      const html = await service.handleCallback(
        'google',
        undefined,
        undefined,
        'access_denied',
      );
      expect(html).toContain('error=access_denied');
      expect(stateModel.findOneAndDelete).not.toHaveBeenCalled();
    });

    it('redirects with invalid_state when the state cannot be found/consumed', async () => {
      stateModel.findOneAndDelete.mockResolvedValue(null);
      const html = await service.handleCallback(
        'google',
        'code-1',
        'bad-state',
        undefined,
      );
      expect(html).toContain('error=invalid_state');
    });

    it('exchanges the code, stores an encrypted connection, and redirects to success', async () => {
      const orgId = new Types.ObjectId();
      stateModel.findOneAndDelete.mockResolvedValue({
        organizationId: orgId,
        userId: 'user-1',
        provider: 'google',
      });
      googleProvider.exchangeCode.mockResolvedValue({
        accessToken: 'at',
        refreshToken: 'rt',
        expiresIn: 3600,
        scope: 'calendar.events',
      });
      googleProvider.getAccountEmail.mockResolvedValue('rep@example.com');

      const html = await service.handleCallback(
        'google',
        'code-1',
        'state-1',
        undefined,
      );

      expect(connectionModel.findOneAndUpdate).toHaveBeenCalledWith(
        { organizationId: orgId, userId: 'user-1', provider: 'google' },
        expect.objectContaining({ providerAccountEmail: 'rep@example.com' }),
        { upsert: true, new: true },
      );
      expect(html).toContain('connected=google');
    });

    it('redirects with connection_failed when the provider returns no refresh token', async () => {
      stateModel.findOneAndDelete.mockResolvedValue({
        organizationId: new Types.ObjectId(),
        userId: 'user-1',
        provider: 'google',
      });
      googleProvider.exchangeCode.mockResolvedValue({
        accessToken: 'at',
        expiresIn: 3600,
      });

      const html = await service.handleCallback(
        'google',
        'code-1',
        'state-1',
        undefined,
      );

      expect(html).toContain('error=connection_failed');
      expect(connectionModel.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('onActivityChanged', () => {
    it('does nothing for non-meeting activities', async () => {
      const activity = buildActivity({ type: 'task' });
      await service.onActivityChanged(activity);
      expect(connectionModel.findOne).not.toHaveBeenCalled();
    });

    it('does nothing when the assignee has no active connection', async () => {
      connectionModel.findOne.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      });
      const activity = buildActivity();
      await service.onActivityChanged(activity);
      expect(googleProvider.createEvent).not.toHaveBeenCalled();
    });

    it('creates a remote event and stamps externalCalendar on first push', async () => {
      const connection = buildConnection();
      connectionModel.findOne.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(connection),
      });
      googleProvider.createEvent.mockResolvedValue({
        id: 'evt-1',
        subject: 'Sync call',
        startAt: new Date('2026-08-10T10:00:00Z'),
        endAt: new Date('2026-08-10T10:30:00Z'),
        updatedAt: new Date('2026-08-10T09:00:00Z'),
      });

      const activity = buildActivity();
      await service.onActivityChanged(activity);

      expect(googleProvider.createEvent).toHaveBeenCalledWith(
        'valid-access-token',
        expect.objectContaining({ subject: 'Sync call' }),
      );
      expect(activity.externalCalendar).toMatchObject({
        connectionId: connection._id,
        provider: 'google',
        eventId: 'evt-1',
      });
      expect(activity.save).toHaveBeenCalled();
    });

    it('updates instead of creating when already mapped to this connection', async () => {
      const connection = buildConnection();
      connectionModel.findById.mockResolvedValue(connection);
      googleProvider.updateEvent.mockResolvedValue({
        id: 'evt-1',
        subject: 'Sync call',
        startAt: new Date(),
        endAt: new Date(),
        updatedAt: new Date(),
      });

      const activity = buildActivity({
        externalCalendar: {
          connectionId: connection._id,
          provider: 'google',
          eventId: 'evt-1',
        },
      });
      await service.onActivityChanged(activity);

      expect(googleProvider.updateEvent).toHaveBeenCalledWith(
        'valid-access-token',
        'evt-1',
        expect.anything(),
      );
      expect(googleProvider.createEvent).not.toHaveBeenCalled();
    });

    it('refreshes an expired access token before pushing', async () => {
      const connection = buildConnection({
        tokenExpiresAt: new Date(Date.now() - 1000),
      });
      connectionModel.findOne.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(connection),
      });
      googleProvider.refreshAccessToken.mockResolvedValue({
        accessToken: 'fresh-access-token',
        expiresIn: 3600,
      });
      googleProvider.createEvent.mockResolvedValue({
        id: 'evt-1',
        subject: 'Sync call',
        startAt: new Date(),
        endAt: new Date(),
        updatedAt: new Date(),
      });

      await service.onActivityChanged(buildActivity());

      expect(googleProvider.refreshAccessToken).toHaveBeenCalledWith(
        'valid-refresh-token',
      );
      expect(googleProvider.createEvent).toHaveBeenCalledWith(
        'fresh-access-token',
        expect.anything(),
      );
      expect(connection.save).toHaveBeenCalled();
    });
  });

  describe('onActivityDeleted', () => {
    it('does nothing when the activity was never synced', async () => {
      await service.onActivityDeleted(buildActivity());
      expect(connectionModel.findById).not.toHaveBeenCalled();
    });

    it('deletes the remote event when synced and the connection is active', async () => {
      const connection = buildConnection();
      connectionModel.findById.mockResolvedValue(connection);

      const activity = buildActivity({
        externalCalendar: {
          connectionId: connection._id,
          provider: 'google',
          eventId: 'evt-1',
        },
      });
      await service.onActivityDeleted(activity);

      expect(googleProvider.deleteEvent).toHaveBeenCalledWith(
        'valid-access-token',
        'evt-1',
      );
    });
  });

  describe('reconcileConnection — pull', () => {
    it('creates a local activity for a new remote event', async () => {
      const connection = buildConnection();
      googleProvider.listChanges.mockResolvedValue({
        events: [
          {
            id: 'evt-new',
            subject: 'Remote-created meeting',
            startAt: new Date('2026-08-11T09:00:00Z'),
            endAt: new Date('2026-08-11T09:30:00Z'),
            updatedAt: new Date('2026-08-11T08:00:00Z'),
          },
        ],
        deletedEventIds: [],
        nextCursor: 'cursor-1',
      });
      activityModel.findOne.mockResolvedValue(null);
      activityModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      });

      await service.reconcileConnection(connection as any);

      expect(activityModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'meeting',
          subject: 'Remote-created meeting',
          assignedToId: 'user-1',
        }),
      );
      expect(connection.syncCursor).toBe('cursor-1');
      expect(connection.save).toHaveBeenCalled();
    });

    it('cancels the local activity when the remote event was deleted', async () => {
      const connection = buildConnection();
      googleProvider.listChanges.mockResolvedValue({
        events: [],
        deletedEventIds: ['evt-gone'],
        nextCursor: undefined,
      });
      const mappedActivity = buildActivity({ status: 'pending' });
      activityModel.findOne.mockResolvedValue(mappedActivity);
      activityModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      });

      await service.reconcileConnection(connection as any);

      expect(mappedActivity.status).toBe('cancelled');
      expect(mappedActivity.externalCalendar).toBeUndefined();
      expect(mappedActivity.save).toHaveBeenCalled();
    });

    it('marks the connection as errored when the provider call fails', async () => {
      const connection = buildConnection();
      googleProvider.listChanges.mockRejectedValue(new Error('token revoked'));

      await service.reconcileConnection(connection as any);

      expect(connection.status).toBe('error');
      expect(connection.lastError).toBe('token revoked');
    });
  });
});
