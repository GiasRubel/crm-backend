import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CalendarProviderAdapter,
  CalendarTokenSet,
  LocalEventInput,
  RemoteCalendarEvent,
  RemoteChanges,
} from './calendar-provider.interface';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const EVENTS_URL =
  'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ');

interface GoogleEventItem {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  updated?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

function toDate(part?: { dateTime?: string; date?: string }): Date | null {
  if (!part) return null;
  if (part.dateTime) return new Date(part.dateTime);
  if (part.date) return new Date(`${part.date}T00:00:00Z`);
  return null;
}

@Injectable()
export class GoogleCalendarProvider implements CalendarProviderAdapter {
  constructor(private readonly configService: ConfigService) {}

  private get clientId(): string {
    return this.configService.getOrThrow<string>('GOOGLE_CALENDAR_CLIENT_ID');
  }

  private get clientSecret(): string {
    return this.configService.getOrThrow<string>(
      'GOOGLE_CALENDAR_CLIENT_SECRET',
    );
  }

  buildAuthorizeUrl(redirectUri: string, state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(
    code: string,
    redirectUri: string,
  ): Promise<CalendarTokenSet> {
    return this.requestToken({
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });
  }

  async refreshAccessToken(refreshToken: string): Promise<CalendarTokenSet> {
    return this.requestToken({
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
  }

  private async requestToken(
    extra: Record<string, string>,
  ): Promise<CalendarTokenSet> {
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      ...extra,
    });
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      throw new Error(
        `Google token request failed: ${res.status} ${await res.text()}`,
      );
    }
    const json = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope?: string;
    };
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresIn: json.expires_in,
      scope: json.scope,
    };
  }

  async getAccountEmail(accessToken: string): Promise<string | undefined> {
    const res = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return undefined;
    const json = (await res.json()) as { email?: string };
    return json.email;
  }

  async listChanges(
    accessToken: string,
    cursor?: string,
  ): Promise<RemoteChanges> {
    const events: RemoteCalendarEvent[] = [];
    const deletedEventIds: string[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;

    do {
      const params = new URLSearchParams({ singleEvents: 'true' });
      if (cursor) params.set('syncToken', cursor);
      else params.set('timeMin', new Date().toISOString());
      if (pageToken) params.set('pageToken', pageToken);

      const res = await fetch(`${EVENTS_URL}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (res.status === 410) {
        // syncToken expired/invalid — fall back to a full resync.
        return this.listChanges(accessToken, undefined);
      }
      if (!res.ok) {
        throw new Error(
          `Google events list failed: ${res.status} ${await res.text()}`,
        );
      }

      const json = (await res.json()) as {
        items?: GoogleEventItem[];
        nextPageToken?: string;
        nextSyncToken?: string;
      };

      for (const item of json.items ?? []) {
        if (item.status === 'cancelled') {
          deletedEventIds.push(item.id);
          continue;
        }
        const startAt = toDate(item.start);
        const endAt = toDate(item.end);
        if (!startAt || !endAt) continue;
        events.push({
          id: item.id,
          subject: item.summary ?? '(untitled)',
          description: item.description,
          startAt,
          endAt,
          updatedAt: item.updated ? new Date(item.updated) : new Date(),
        });
      }

      pageToken = json.nextPageToken;
      if (json.nextSyncToken) nextSyncToken = json.nextSyncToken;
    } while (pageToken);

    return { events, deletedEventIds, nextCursor: nextSyncToken };
  }

  async createEvent(
    accessToken: string,
    input: LocalEventInput,
  ): Promise<RemoteCalendarEvent> {
    return this.writeEvent(accessToken, 'POST', EVENTS_URL, input);
  }

  async updateEvent(
    accessToken: string,
    eventId: string,
    input: LocalEventInput,
  ): Promise<RemoteCalendarEvent> {
    return this.writeEvent(
      accessToken,
      'PATCH',
      `${EVENTS_URL}/${encodeURIComponent(eventId)}`,
      input,
    );
  }

  private async writeEvent(
    accessToken: string,
    method: 'POST' | 'PATCH',
    url: string,
    input: LocalEventInput,
  ): Promise<RemoteCalendarEvent> {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: input.subject,
        description: input.description,
        start: { dateTime: input.startAt.toISOString() },
        end: { dateTime: input.endAt.toISOString() },
      }),
    });
    if (!res.ok) {
      throw new Error(
        `Google event ${method} failed: ${res.status} ${await res.text()}`,
      );
    }
    const json = (await res.json()) as GoogleEventItem;
    return {
      id: json.id,
      subject: json.summary ?? input.subject,
      description: json.description,
      startAt: toDate(json.start) ?? input.startAt,
      endAt: toDate(json.end) ?? input.endAt,
      updatedAt: json.updated ? new Date(json.updated) : new Date(),
    };
  }

  async deleteEvent(accessToken: string, eventId: string): Promise<void> {
    const res = await fetch(`${EVENTS_URL}/${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    // 410 Gone = already deleted remotely — treat as success.
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      throw new Error(
        `Google event delete failed: ${res.status} ${await res.text()}`,
      );
    }
  }
}
