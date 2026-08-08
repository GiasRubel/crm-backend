import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CalendarProviderAdapter,
  CalendarTokenSet,
  LocalEventInput,
  RemoteCalendarEvent,
  RemoteChanges,
} from './calendar-provider.interface';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const EVENTS_URL = `${GRAPH_BASE}/me/events`;
const SCOPES = ['offline_access', 'User.Read', 'Calendars.ReadWrite'].join(' ');

interface GraphEventItem {
  id: string;
  '@removed'?: { reason: string };
  subject?: string;
  body?: { content?: string };
  lastModifiedDateTime?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
}

function toDate(part?: { dateTime?: string }): Date | null {
  // Graph datetimes are naive local-to-timezone strings but we always write UTC,
  // and read events default to UTC unless the user's mailbox changed it — append Z.
  if (!part?.dateTime) return null;
  const raw = part.dateTime.endsWith('Z') ? part.dateTime : `${part.dateTime}Z`;
  return new Date(raw);
}

@Injectable()
export class MicrosoftCalendarProvider implements CalendarProviderAdapter {
  constructor(private readonly configService: ConfigService) {}

  private get tenant(): string {
    return this.configService.get<string>(
      'MICROSOFT_CALENDAR_TENANT_ID',
      'common',
    );
  }

  private get clientId(): string {
    return this.configService.getOrThrow<string>(
      'MICROSOFT_CALENDAR_CLIENT_ID',
    );
  }

  private get clientSecret(): string {
    return this.configService.getOrThrow<string>(
      'MICROSOFT_CALENDAR_CLIENT_SECRET',
    );
  }

  private get authorizeUrl(): string {
    return `https://login.microsoftonline.com/${this.tenant}/oauth2/v2.0/authorize`;
  }

  private get tokenUrl(): string {
    return `https://login.microsoftonline.com/${this.tenant}/oauth2/v2.0/token`;
  }

  buildAuthorizeUrl(redirectUri: string, state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      response_mode: 'query',
      scope: SCOPES,
      state,
    });
    return `${this.authorizeUrl}?${params.toString()}`;
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
      scope: SCOPES,
      ...extra,
    });
    const res = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      throw new Error(
        `Microsoft token request failed: ${res.status} ${await res.text()}`,
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
    const res = await fetch(`${GRAPH_BASE}/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return undefined;
    const json = (await res.json()) as {
      mail?: string;
      userPrincipalName?: string;
    };
    return json.mail ?? json.userPrincipalName;
  }

  async listChanges(
    accessToken: string,
    cursor?: string,
  ): Promise<RemoteChanges> {
    const events: RemoteCalendarEvent[] = [];
    const deletedEventIds: string[] = [];
    let url = cursor ?? `${EVENTS_URL}/delta`;
    let nextCursor: string | undefined;

    do {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (res.status === 410) {
        // deltaLink expired — Graph returns a fresh location to restart from.
        const json = (await res.json()) as {
          error?: { message?: string };
          '@odata.location'?: string;
        };
        if (json['@odata.location']) {
          return this.listChanges(accessToken, json['@odata.location']);
        }
        return this.listChanges(accessToken, undefined);
      }
      if (!res.ok) {
        throw new Error(
          `Microsoft events delta failed: ${res.status} ${await res.text()}`,
        );
      }

      const json = (await res.json()) as {
        value?: GraphEventItem[];
        '@odata.nextLink'?: string;
        '@odata.deltaLink'?: string;
      };

      for (const item of json.value ?? []) {
        if (item['@removed']) {
          deletedEventIds.push(item.id);
          continue;
        }
        const startAt = toDate(item.start);
        const endAt = toDate(item.end);
        if (!startAt || !endAt) continue;
        events.push({
          id: item.id,
          subject: item.subject ?? '(untitled)',
          description: item.body?.content,
          startAt,
          endAt,
          updatedAt: item.lastModifiedDateTime
            ? new Date(item.lastModifiedDateTime)
            : new Date(),
        });
      }

      if (json['@odata.nextLink']) {
        url = json['@odata.nextLink'];
      } else {
        nextCursor = json['@odata.deltaLink'];
        url = '';
      }
    } while (url);

    return { events, deletedEventIds, nextCursor };
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
        subject: input.subject,
        body: { contentType: 'text', content: input.description ?? '' },
        start: { dateTime: input.startAt.toISOString(), timeZone: 'UTC' },
        end: { dateTime: input.endAt.toISOString(), timeZone: 'UTC' },
      }),
    });
    if (!res.ok) {
      throw new Error(
        `Microsoft event ${method} failed: ${res.status} ${await res.text()}`,
      );
    }
    const json = (await res.json()) as GraphEventItem;
    return {
      id: json.id,
      subject: json.subject ?? input.subject,
      description: json.body?.content,
      startAt: toDate(json.start) ?? input.startAt,
      endAt: toDate(json.end) ?? input.endAt,
      updatedAt: json.lastModifiedDateTime
        ? new Date(json.lastModifiedDateTime)
        : new Date(),
    };
  }

  async deleteEvent(accessToken: string, eventId: string): Promise<void> {
    const res = await fetch(`${EVENTS_URL}/${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(
        `Microsoft event delete failed: ${res.status} ${await res.text()}`,
      );
    }
  }
}
