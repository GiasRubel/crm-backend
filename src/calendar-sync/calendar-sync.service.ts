import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'crypto';
import { isValidObjectId, Model, Types } from 'mongoose';
import { Activity, ActivityDocument } from '../activities/activity.schema';
import {
  CalendarConnection,
  CalendarConnectionDocument,
  CalendarProvider,
} from './calendar-connection.schema';
import {
  CalendarOauthState,
  CalendarOauthStateDocument,
} from './calendar-oauth-state.schema';
import { CalendarConnectionResponseDto } from './dto/calendar-connection-response.dto';
import { toCalendarConnectionResponseDto } from './mappers/calendar-connection.mapper';
import { CalendarProviderAdapter } from './providers/calendar-provider.interface';
import { GoogleCalendarProvider } from './providers/google-calendar.provider';
import { MicrosoftCalendarProvider } from './providers/microsoft-calendar.provider';
import {
  deriveCalendarEncryptionKey,
  decryptToken,
  encryptToken,
} from './token-crypto.util';

const STATE_TTL_MS = 10 * 60 * 1000;
/** Refresh proactively — avoids a request racing a token that expires mid-flight. */
const TOKEN_REFRESH_SKEW_MS = 60 * 1000;
/** Push echoes back within one sync cycle; ignore remote updates newer than our own push by less than this. */
const ECHO_GUARD_MS = 2 * 60 * 1000;
const DEFAULT_MEETING_DURATION_MS = 30 * 60 * 1000;

@Injectable()
export class CalendarSyncService {
  private readonly logger = new Logger(CalendarSyncService.name);

  constructor(
    @InjectModel(CalendarConnection.name)
    private readonly connectionModel: Model<CalendarConnectionDocument>,
    @InjectModel(CalendarOauthState.name)
    private readonly stateModel: Model<CalendarOauthStateDocument>,
    @InjectModel(Activity.name)
    private readonly activityModel: Model<ActivityDocument>,
    private readonly configService: ConfigService,
    private readonly googleProvider: GoogleCalendarProvider,
    private readonly microsoftProvider: MicrosoftCalendarProvider,
  ) {}

  private providerFor(provider: CalendarProvider): CalendarProviderAdapter {
    return provider === 'google' ? this.googleProvider : this.microsoftProvider;
  }

  private redirectUriFor(provider: CalendarProvider): string {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3001';
    return `${frontendUrl}/api/backend/calendar-sync/${provider}/callback`;
  }

  private get encryptionKey(): Buffer {
    return deriveCalendarEncryptionKey(
      this.configService.getOrThrow<string>('CALENDAR_TOKEN_ENCRYPTION_KEY'),
    );
  }

  // ── OAuth ────────────────────────────────────────────────────────────────

  async getAuthorizeUrl(
    provider: CalendarProvider,
    userId: string,
    organizationId: Types.ObjectId,
  ): Promise<{ url: string }> {
    const state = randomBytes(24).toString('hex');
    await this.stateModel.create({
      state,
      organizationId,
      userId,
      provider,
      expiresAt: new Date(Date.now() + STATE_TTL_MS),
    });
    const url = this.providerFor(provider).buildAuthorizeUrl(
      this.redirectUriFor(provider),
      state,
    );
    return { url };
  }

  /** Returns a self-contained HTML page that redirects the browser back into the app. */
  async handleCallback(
    provider: CalendarProvider,
    code: string | undefined,
    state: string | undefined,
    error: string | undefined,
  ): Promise<string> {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3001';

    if (error || !code || !state) {
      return this.redirectPage(
        `${frontendUrl}/activities/calendar-sync?error=${encodeURIComponent(error ?? 'missing_code')}`,
      );
    }

    const stateDoc = await this.stateModel.findOneAndDelete({
      state,
      provider,
    });
    if (!stateDoc) {
      return this.redirectPage(
        `${frontendUrl}/activities/calendar-sync?error=invalid_state`,
      );
    }

    try {
      const adapter = this.providerFor(provider);
      const tokens = await adapter.exchangeCode(
        code,
        this.redirectUriFor(provider),
      );
      if (!tokens.refreshToken) {
        throw new Error(
          'Provider did not return a refresh token (consent prompt may be required)',
        );
      }
      const providerAccountEmail = await adapter.getAccountEmail(
        tokens.accessToken,
      );

      await this.connectionModel.findOneAndUpdate(
        {
          organizationId: stateDoc.organizationId,
          userId: stateDoc.userId,
          provider,
        },
        {
          organizationId: stateDoc.organizationId,
          userId: stateDoc.userId,
          provider,
          providerAccountEmail,
          accessTokenEnc: encryptToken(tokens.accessToken, this.encryptionKey),
          refreshTokenEnc: encryptToken(
            tokens.refreshToken,
            this.encryptionKey,
          ),
          tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
          scope: tokens.scope,
          status: 'active',
          lastError: undefined,
          syncCursor: undefined,
        },
        { upsert: true, new: true },
      );

      return this.redirectPage(
        `${frontendUrl}/activities/calendar-sync?connected=${provider}`,
      );
    } catch (err) {
      this.logger.error(`OAuth callback failed for ${provider}:`, err);
      return this.redirectPage(
        `${frontendUrl}/activities/calendar-sync?error=connection_failed`,
      );
    }
  }

  private redirectPage(url: string): string {
    return `<!doctype html><html><head><meta charset="utf-8"><title>Connecting…</title></head><body>Connecting your calendar… <script>location.replace(${JSON.stringify(url)});</script></body></html>`;
  }

  // ── Connections CRUD ─────────────────────────────────────────────────────

  async listConnections(
    userId: string,
    organizationId: Types.ObjectId,
  ): Promise<CalendarConnectionResponseDto[]> {
    const connections = await this.connectionModel
      .find({ organizationId, userId })
      .sort({ createdAt: 1 })
      .exec();
    return connections.map(toCalendarConnectionResponseDto);
  }

  async disconnect(
    id: string,
    userId: string,
    organizationId: Types.ObjectId,
  ): Promise<void> {
    const connection = await this.getOwnedConnectionOrFail(
      id,
      userId,
      organizationId,
    );
    await this.connectionModel.deleteOne({ _id: connection._id }).exec();
  }

  async syncNow(
    id: string,
    userId: string,
    organizationId: Types.ObjectId,
  ): Promise<CalendarConnectionResponseDto> {
    const connection = await this.getOwnedConnectionOrFail(
      id,
      userId,
      organizationId,
    );
    await this.reconcileConnection(connection);
    return toCalendarConnectionResponseDto(connection);
  }

  private async getOwnedConnectionOrFail(
    id: string,
    userId: string,
    organizationId: Types.ObjectId,
  ): Promise<CalendarConnectionDocument> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Calendar connection ${id} not found`);
    }
    const connection = await this.connectionModel.findOne({
      _id: id,
      organizationId,
    });
    if (!connection) {
      throw new NotFoundException(`Calendar connection ${id} not found`);
    }
    if (connection.userId !== userId) {
      throw new ForbiddenException(
        'This calendar connection belongs to another user',
      );
    }
    return connection;
  }

  // ── Token refresh ────────────────────────────────────────────────────────

  private async getValidAccessToken(
    connection: CalendarConnectionDocument,
  ): Promise<string> {
    if (
      connection.tokenExpiresAt.getTime() - TOKEN_REFRESH_SKEW_MS >
      Date.now()
    ) {
      return decryptToken(connection.accessTokenEnc, this.encryptionKey);
    }
    try {
      const refreshToken = decryptToken(
        connection.refreshTokenEnc,
        this.encryptionKey,
      );
      const tokens = await this.providerFor(
        connection.provider,
      ).refreshAccessToken(refreshToken);
      connection.accessTokenEnc = encryptToken(
        tokens.accessToken,
        this.encryptionKey,
      );
      if (tokens.refreshToken) {
        connection.refreshTokenEnc = encryptToken(
          tokens.refreshToken,
          this.encryptionKey,
        );
      }
      connection.tokenExpiresAt = new Date(
        Date.now() + tokens.expiresIn * 1000,
      );
      connection.status = 'active';
      connection.lastError = undefined;
      await connection.save();
      return tokens.accessToken;
    } catch (err) {
      connection.status = 'error';
      connection.lastError =
        err instanceof Error ? err.message : 'Token refresh failed';
      await connection.save();
      throw err;
    }
  }

  // ── Push (local → remote), called from ActivitiesService ────────────────

  private isSyncable(activity: ActivityDocument): boolean {
    return activity.type === 'meeting' && !!activity.startAt;
  }

  /** Best-effort — callers must catch/log, never let this fail the activity write. */
  async onActivityChanged(activity: ActivityDocument): Promise<void> {
    if (!this.isSyncable(activity)) return;

    const connection = await this.pickConnectionFor(activity);
    if (!connection) return;

    const accessToken = await this.getValidAccessToken(connection);
    await this.pushOne(activity, connection, accessToken);
  }

  /** Best-effort — callers must catch/log, never let this fail the activity write. */
  async onActivityDeleted(activity: ActivityDocument): Promise<void> {
    if (!activity.externalCalendar) return;
    const connection = await this.connectionModel
      .findOne({
        _id: activity.externalCalendar.connectionId,
        organizationId: activity.organizationId,
      })
      .exec();
    if (!connection || connection.status !== 'active') return;

    const accessToken = await this.getValidAccessToken(connection);
    await this.providerFor(connection.provider).deleteEvent(
      accessToken,
      activity.externalCalendar.eventId,
    );
  }

  /**
   * A user may connect more than one provider, but an Activity only tracks
   * one `externalCalendar` mapping — prefer the connection it's already
   * mapped to, otherwise the assignee's first active connection. Widening
   * this to fan out to every connected provider is a fine follow-up, not
   * needed for v1.
   */
  private async pickConnectionFor(
    activity: ActivityDocument,
  ): Promise<CalendarConnectionDocument | null> {
    if (activity.externalCalendar) {
      const mapped = await this.connectionModel
        .findOne({
          _id: activity.externalCalendar.connectionId,
          organizationId: activity.organizationId,
        })
        .exec();
      if (mapped && mapped.status === 'active') return mapped;
    }
    return this.connectionModel
      .findOne({
        organizationId: activity.organizationId,
        userId: activity.assignedToId,
        status: 'active',
      })
      .sort({ createdAt: 1 })
      .exec();
  }

  private async pushOne(
    activity: ActivityDocument,
    connection: CalendarConnectionDocument,
    accessToken: string,
  ): Promise<void> {
    const adapter = this.providerFor(connection.provider);
    const input = {
      subject: activity.subject,
      description: activity.description,
      startAt: activity.startAt!,
      endAt:
        activity.endAt ??
        new Date(activity.startAt!.getTime() + DEFAULT_MEETING_DURATION_MS),
    };

    const remoteEvent = activity.externalCalendar?.connectionId.equals(
      connection._id,
    )
      ? await adapter.updateEvent(
          accessToken,
          activity.externalCalendar.eventId,
          input,
        )
      : await adapter.createEvent(accessToken, input);

    activity.externalCalendar = {
      connectionId: connection._id,
      provider: connection.provider,
      eventId: remoteEvent.id,
      remoteUpdatedAt: remoteEvent.updatedAt,
      lastPushedAt: new Date(),
    };
    await activity.save();
  }

  // ── Pull (remote → local) + reconciliation, called by the cron ──────────

  async reconcileConnection(
    connection: CalendarConnectionDocument,
  ): Promise<void> {
    try {
      const accessToken = await this.getValidAccessToken(connection);
      await this.pullChanges(connection, accessToken);
      await this.pushPending(connection, accessToken);

      connection.status = 'active';
      connection.lastError = undefined;
      connection.lastSyncedAt = new Date();
      await connection.save();
    } catch (err) {
      connection.status = 'error';
      connection.lastError = err instanceof Error ? err.message : 'Sync failed';
      await connection.save();
      this.logger.error(
        `Calendar sync failed for connection ${connection._id.toString()} (${connection.provider}):`,
        err,
      );
    }
  }

  private async pullChanges(
    connection: CalendarConnectionDocument,
    accessToken: string,
  ): Promise<void> {
    const adapter = this.providerFor(connection.provider);
    const changes = await adapter.listChanges(
      accessToken,
      connection.syncCursor,
    );

    for (const eventId of changes.deletedEventIds) {
      const activity = await this.activityModel.findOne({
        organizationId: connection.organizationId,
        'externalCalendar.connectionId': connection._id,
        'externalCalendar.eventId': eventId,
      });
      if (!activity) continue;
      activity.status = 'cancelled';
      activity.externalCalendar = undefined;
      await activity.save();
    }

    for (const event of changes.events) {
      const existing = await this.activityModel.findOne({
        organizationId: connection.organizationId,
        'externalCalendar.connectionId': connection._id,
        'externalCalendar.eventId': event.id,
      });

      if (existing) {
        // Skip our own recent push echoing back unchanged (or only slightly
        // newer, e.g. provider-side field normalization).
        const lastPushed = existing.externalCalendar?.lastPushedAt;
        if (
          lastPushed &&
          event.updatedAt.getTime() - lastPushed.getTime() < ECHO_GUARD_MS
        ) {
          continue;
        }
        existing.subject = event.subject;
        existing.description = event.description;
        existing.startAt = event.startAt;
        existing.endAt = event.endAt;
        existing.externalCalendar = {
          connectionId: connection._id,
          provider: connection.provider,
          eventId: event.id,
          remoteUpdatedAt: event.updatedAt,
          lastPushedAt: existing.externalCalendar?.lastPushedAt,
        };
        await existing.save();
        continue;
      }

      await this.activityModel.create({
        organizationId: connection.organizationId,
        type: 'meeting',
        subject: event.subject,
        description: event.description,
        status: 'pending',
        priority: 'normal',
        startAt: event.startAt,
        endAt: event.endAt,
        createdBy: connection.userId,
        assignedToId: connection.userId,
        externalCalendar: {
          connectionId: connection._id,
          provider: connection.provider,
          eventId: event.id,
          remoteUpdatedAt: event.updatedAt,
        },
      });
    }

    if (changes.nextCursor) {
      connection.syncCursor = changes.nextCursor;
    }
  }

  /** Catches local meetings created/edited since the last reconcile that the
   *  best-effort inline push (onActivityChanged) missed — e.g. the token was
   *  expired/erroring at the time, or the process restarted mid-flight. */
  private async pushPending(
    connection: CalendarConnectionDocument,
    accessToken: string,
  ): Promise<void> {
    const candidates = await this.activityModel
      .find({
        organizationId: connection.organizationId,
        assignedToId: connection.userId,
        type: 'meeting',
        startAt: { $exists: true },
        status: { $ne: 'cancelled' },
        $or: [
          { externalCalendar: { $exists: false } },
          { 'externalCalendar.connectionId': connection._id },
        ],
      })
      .exec();

    for (const activity of candidates) {
      const mapping = activity.externalCalendar;
      if (mapping && mapping.connectionId.equals(connection._id)) {
        const pushedAt = mapping.lastPushedAt?.getTime() ?? 0;
        if ((activity.updatedAt?.getTime() ?? 0) <= pushedAt) continue;
      }
      try {
        await this.pushOne(activity, connection, accessToken);
      } catch (err) {
        this.logger.error(
          `Failed to push activity ${activity._id.toString()} to ${connection.provider}:`,
          err,
        );
      }
    }
  }
}
