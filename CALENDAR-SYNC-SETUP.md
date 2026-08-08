# Live Calendar Sync — Setup

Two-way sync between CRM `meeting` activities and a staff member's own Google
Calendar and/or Microsoft 365 (Outlook) calendar. See
`../ACTIVITIES-AND-ENGAGEMENT-DEVELOPER.md` for how it fits into the
Activities module, and `src/calendar-sync/` for the implementation.

This doc walks through registering an OAuth app with each provider so you can
fill in the `crm-backend/.env` variables below.

## Redirect URIs

Both providers redirect the browser back through the frontend's existing BFF
proxy (`crm-frontend`'s `/api/backend/*` route) — register exactly these,
substituting your real `FRONTEND_URL`:

```
http://localhost:3001/api/backend/calendar-sync/google/callback
http://localhost:3001/api/backend/calendar-sync/microsoft/callback
```

In production, swap `http://localhost:3001` for your deployed frontend origin.

## 1. Google Calendar

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and
   create (or select) a project.
2. **APIs & Services → Library** — enable the **Google Calendar API**.
3. **APIs & Services → OAuth consent screen** — configure it (External is
   fine for testing with your own Google account; add your account as a test
   user while the app is in "Testing" mode). Scopes needed:
   `openid`, `email`, `https://www.googleapis.com/auth/calendar.events`.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   — Application type **Web application**. Add the Google redirect URI above
   under **Authorized redirect URIs**.
5. Copy the generated **Client ID** and **Client secret** into
   `crm-backend/.env`:
   ```
   GOOGLE_CALENDAR_CLIENT_ID=...
   GOOGLE_CALENDAR_CLIENT_SECRET=...
   ```

Note: while the OAuth consent screen is in "Testing" status, only accounts
added as test users can connect. Publish the app (or verify it, for
`calendar.events` sensitive-scope access) before rolling this out beyond your
own test accounts.

## 2. Microsoft 365 / Outlook (Microsoft Graph)

1. Go to the [Azure Portal](https://portal.azure.com/) →
   **Microsoft Entra ID → App registrations → New registration**.
2. Name it (e.g. "CRM Calendar Sync"). Under **Supported account types**, pick
   the option matching your tenancy (single-tenant, or "Accounts in any
   organizational directory and personal Microsoft accounts" for broadest
   reach — this determines `MICROSOFT_CALENDAR_TENANT_ID` below).
3. Under **Redirect URI**, add a **Web** platform redirect with the Microsoft
   URI above.
4. **Certificates & secrets → New client secret** — copy the secret **value**
   immediately (it's hidden after you navigate away).
5. **API permissions → Add a permission → Microsoft Graph → Delegated
   permissions** — add `Calendars.ReadWrite`, `offline_access`, `User.Read`.
   Grant admin consent if your tenant requires it.
6. Copy values into `crm-backend/.env`:
   ```
   MICROSOFT_CALENDAR_CLIENT_ID=...        # "Application (client) ID"
   MICROSOFT_CALENDAR_CLIENT_SECRET=...    # the secret value from step 4
   MICROSOFT_CALENDAR_TENANT_ID=common     # or your tenant ID for single-tenant apps
   ```

## 3. Token encryption key

Connected OAuth tokens are encrypted at rest (AES-256-GCM, same pattern as
`mail-settings`' SMTP password encryption). Generate a real secret for any
deployed environment:

```bash
openssl rand -hex 32
```

```
CALENDAR_TOKEN_ENCRYPTION_KEY=<paste here>
```

Changing this key after connections exist will make existing stored tokens
unreadable — affected users will need to reconnect from
`/activities/calendar-sync`.

## Verifying it works

1. Restart the backend so the new env vars load.
2. In the CRM, go to **Activities → Calendar sync** and click **Connect**
   under Google or Microsoft.
3. After granting consent you're redirected back with a connected status.
4. Create a `meeting` activity with a start time assigned to yourself —
   it should appear in the connected calendar within a few seconds.
5. Edit or delete the event in Google/Outlook directly — within 5 minutes
   (or immediately via **Sync now**) the change reflects back in the CRM.

## How it works (brief)

- The backend owns the entire OAuth exchange (client secret, refresh) — see
  `src/calendar-sync/calendar-sync.service.ts`. No public webhook endpoint is
  required; a `@nestjs/schedule` cron polls every 5 minutes
  (`calendar-sync.cron.ts`).
- Local → remote pushes happen inline, best-effort, right after an activity
  is created/updated/completed/deleted (`ActivitiesService`); the cron
  reconciles anything that inline push missed (token expired, process
  restarted, etc).
- Only `type: 'meeting'` activities with a `startAt` participate. Each synced
  activity tracks its remote event via `Activity.externalCalendar`.
