/** Result of an OAuth code/refresh-token exchange. */
export interface CalendarTokenSet {
  accessToken: string;
  /** Only Google returns a refresh token on every grant; omitted → keep the existing one. */
  refreshToken?: string;
  expiresIn: number;
  scope?: string;
}

/** A calendar event as fetched from the provider, normalized to CRM fields. */
export interface RemoteCalendarEvent {
  id: string;
  subject: string;
  description?: string;
  startAt: Date;
  endAt: Date;
  updatedAt: Date;
}

export interface RemoteChanges {
  events: RemoteCalendarEvent[];
  deletedEventIds: string[];
  /** Opaque cursor to resume incremental sync from next time; undefined means "start a full resync". */
  nextCursor?: string;
}

/** What the CRM pushes out when a local meeting activity is created/updated. */
export interface LocalEventInput {
  subject: string;
  description?: string;
  startAt: Date;
  endAt: Date;
}

/** Common shape every calendar provider adapter implements. */
export interface CalendarProviderAdapter {
  buildAuthorizeUrl(redirectUri: string, state: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<CalendarTokenSet>;
  refreshAccessToken(refreshToken: string): Promise<CalendarTokenSet>;
  getAccountEmail(accessToken: string): Promise<string | undefined>;
  /** Incremental fetch since `cursor`; omit cursor for the first full sync. */
  listChanges(accessToken: string, cursor?: string): Promise<RemoteChanges>;
  createEvent(
    accessToken: string,
    input: LocalEventInput,
  ): Promise<RemoteCalendarEvent>;
  updateEvent(
    accessToken: string,
    eventId: string,
    input: LocalEventInput,
  ): Promise<RemoteCalendarEvent>;
  deleteEvent(accessToken: string, eventId: string): Promise<void>;
}
