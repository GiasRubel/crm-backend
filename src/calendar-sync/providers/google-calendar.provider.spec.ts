import { ConfigService } from '@nestjs/config';
import { GoogleCalendarProvider } from './google-calendar.provider';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('GoogleCalendarProvider', () => {
  let provider: GoogleCalendarProvider;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    const configService = {
      getOrThrow: jest.fn((key: string) => {
        if (key === 'GOOGLE_CALENDAR_CLIENT_ID') return 'client-id';
        if (key === 'GOOGLE_CALENDAR_CLIENT_SECRET') return 'client-secret';
        throw new Error(`unexpected key ${key}`);
      }),
    } as unknown as ConfigService;
    provider = new GoogleCalendarProvider(configService);
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => jest.restoreAllMocks());

  it('builds an authorize URL with client id, redirect uri, and state', () => {
    const url = provider.buildAuthorizeUrl(
      'https://app.test/callback',
      'state-123',
    );
    expect(url).toContain('client_id=client-id');
    expect(url).toContain('state=state-123');
    expect(url).toContain(encodeURIComponent('https://app.test/callback'));
    expect(url).toContain('access_type=offline');
  });

  it('exchanges a code for tokens', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        access_token: 'at',
        refresh_token: 'rt',
        expires_in: 3600,
        scope: 'calendar.events',
      }),
    );

    const tokens = await provider.exchangeCode('code', 'https://app.test/cb');

    expect(tokens).toEqual({
      accessToken: 'at',
      refreshToken: 'rt',
      expiresIn: 3600,
      scope: 'calendar.events',
    });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.body.toString()).toContain('grant_type=authorization_code');
  });

  it('throws when the token endpoint responds with an error', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: 'invalid_grant' }, 400),
    );

    await expect(
      provider.exchangeCode('bad-code', 'https://app.test/cb'),
    ).rejects.toThrow(/Google token request failed/);
  });

  it('maps a full-sync events page into RemoteChanges, skipping cancelled events', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        items: [
          {
            id: 'evt-1',
            summary: 'Kickoff',
            start: { dateTime: '2026-08-10T10:00:00Z' },
            end: { dateTime: '2026-08-10T10:30:00Z' },
            updated: '2026-08-09T00:00:00Z',
          },
          { id: 'evt-2', status: 'cancelled' },
        ],
        nextSyncToken: 'sync-token-1',
      }),
    );

    const result = await provider.listChanges('at');

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ id: 'evt-1', subject: 'Kickoff' });
    expect(result.deletedEventIds).toEqual(['evt-2']);
    expect(result.nextCursor).toBe('sync-token-1');
  });

  it('retries a full resync when the sync token has expired (410)', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, 410))
      .mockResolvedValueOnce(
        jsonResponse({ items: [], nextSyncToken: 'fresh-token' }),
      );

    const result = await provider.listChanges('at', 'stale-token');

    expect(result.nextCursor).toBe('fresh-token');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // second call must not carry the stale syncToken
    expect(fetchMock.mock.calls[1][0]).not.toContain('syncToken');
  });

  it('creates an event with the given subject/description/times', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: 'evt-new',
        summary: 'Demo',
        updated: '2026-08-09T00:00:00Z',
        start: { dateTime: '2026-08-10T10:00:00Z' },
        end: { dateTime: '2026-08-10T10:30:00Z' },
      }),
    );

    const event = await provider.createEvent('at', {
      subject: 'Demo',
      description: 'desc',
      startAt: new Date('2026-08-10T10:00:00Z'),
      endAt: new Date('2026-08-10T10:30:00Z'),
    });

    expect(event.id).toBe('evt-new');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/calendars/primary/events');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toMatchObject({ summary: 'Demo' });
  });

  it('treats a 404/410 on delete as success', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 410));
    await expect(provider.deleteEvent('at', 'evt-1')).resolves.toBeUndefined();
  });
});
