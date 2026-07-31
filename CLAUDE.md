# CRM Backend — CLAUDE.md

NestJS 11 REST API for the CRM. MongoDB (Mongoose) for persistence, Keycloak for
identity/auth. Serves the Next.js frontend in `../crm-frontend`.

## Stack

- **NestJS 11** (Express platform), TypeScript, `ts-jest` + Jest for tests.
- **MongoDB** via `@nestjs/mongoose` (`Mongoose` 9). Connection from `MONGO_URI`.
- **Keycloak** as the OIDC identity provider. The API is a resource server: it
  validates RS256 JWTs against Keycloak's JWKS and also acts as a Keycloak *admin*
  client to provision/update/delete users.
- **Nodemailer** for OTP + transactional mail.
- Config via `@nestjs/config` (`ConfigModule.forRoot({ isGlobal: true })`) — read
  everything through `ConfigService`, never `process.env` directly in feature code
  (`main.ts` is the one exception).

## Commands (package manager: yarn — `yarn.lock` is committed)

```bash
yarn start:dev      # nest start --watch (dev)
yarn start:prod     # node dist/main (after yarn build)
yarn build          # nest build
yarn lint           # eslint --fix over {src,apps,libs,test}
yarn format         # prettier --write
yarn test           # jest (*.spec.ts next to source, rootDir=src)
yarn test:e2e       # jest --config ./test/jest-e2e.json
```

Runs on `PORT` (`.env` sets **5000**). CORS is locked to `FRONTEND_URL`
(`http://localhost:3001`). Docker Compose (`docker-compose.yml`) brings up Mongo +
Keycloak locally. See `KEYCLOAK-SETUP.md` for realm/client setup.

## Architecture & conventions

Standard Nest feature-module layout. Each domain folder owns its
`*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.schema.ts`, `dto/`, and
`mappers/`.

```
src/
  main.ts                 # bootstrap: global ValidationPipe, CORS, no-cache headers
  app.module.ts           # root; wires Config, Mongoose, and all feature modules
  auth/                   # JWT resource-server auth + RBAC (see below)
    strategies/           # jwt.strategy.ts — Passport + jwks-rsa
    guards/               # jwt-auth.guard.ts (authN), roles.guard.ts (authZ)
    decorators/           # @Public(), @Roles(), @CurrentUser()
    password/             # forgot/reset password flow
  users/                  # app user records mirrored from Keycloak; AppRole enum
  customers/              # customer CRUD + Keycloak/Mongo provisioning
  teams/                  # teams/territories: member groups, record routing (see ../TEAMS-AND-TERRITORIES.md)
  leads/                  # lead capture (public endpoint), scoring, qualification, conversion (see ../LEADS-AND-PIPELINE-DEVELOPER.md)
  opportunities/          # sales pipeline: stages, Kanban board endpoint, win/loss; optional accountId link
  accounts/               # B2B company profiles + 360° summary (see ../CONTACTS-AND-ACCOUNTS-DEVELOPER.md)
  contacts/               # person profiles: interactions history, preferences, account/customer links
  activities/             # tasks + communication log + ICS export (see ../ACTIVITIES-AND-ENGAGEMENT-DEVELOPER.md)
  events/                 # CrmEventBus (GLOBAL) — in-process domain events; services emit after saves
  automations/            # rule engine: trigger rules + SLA idle sweep (see ../AUTOMATION-AND-WORKFLOWS-DEVELOPER.md)
  tickets/                # helpdesk: numbered tickets, comments/internal notes, customer portal (see ../SERVICE-AND-SUPPORT-DEVELOPER.md)
  reports/                # read-only analytics: dashboards + custom report builder over all domains (see ../REPORTING-AND-ANALYTICS-DEVELOPER.md)
  kb/                     # knowledge base: internal wiki + @Public FAQ endpoints
  keycloak-admin/         # KeycloakAdminService — admin REST client (GLOBAL module)
  otp/                    # email OTP send/verify
  mail/                   # Nodemailer wrapper (GLOBAL)
  config/                 # DEPLOYMENT_MODE (standalone|saas) flag helper
  bootstrap/              # standalone-mode default Organization/Subscription auto-provisioning
  organizations/          # multi-tenant Organization CRUD + SaaS cross-org provisioning
  subscriptions/          # Stripe billing (customer/subscription/portal/webhooks), optional
  licensing/              # Envato purchase-code activation (CodeCanyon anti-piracy)
```

`config/` + `bootstrap/` + `organizations/` + `subscriptions/` + `licensing/`
together implement the standalone/SaaS dual-license model (one codebase, a
`DEPLOYMENT_MODE` flag, optional Stripe billing, Envato activation) — see
`../DEPLOYMENT-AND-LICENSING-DEVELOPER.md`.

### Auth model (important)

- Auth is **global**. `AuthModule` registers `JwtAuthGuard` and then `RolesGuard`
  as `APP_GUARD`s, so **every route is authenticated + role-checked by default**.
- To expose an unauthenticated endpoint, add `@Public()` (see `app.controller.ts`).
- `JwtStrategy` validates the token against Keycloak's JWKS (`issuer`, `RS256`,
  cached JWKS) and rejects tokens whose `azp` ≠ `KEYCLOAK_CLIENT_ID`. The decoded
  `KeycloakJwtPayload` is attached to `request.user`.
- **Roles come from Mongo, not the JWT.** `RolesGuard` looks up the app user by
  `payload.sub` (`keycloakId`) via `UsersService` and checks its `role` against the
  `@Roles(...)` list. Roles are the `AppRole` enum: `User`, `Admin`,
  `Administrator`, `Customer`, and `PlatformAdmin` (cross-org CRM operator —
  see `../DEPLOYMENT-AND-LICENSING-BUSINESS.md`).
- Read the caller with `@CurrentUser() user: KeycloakJwtPayload`; the Keycloak
  subject id is `user.sub`. `RolesGuard` also resolves `request.organizationId`
  from the same Mongo user doc — read it with `@CurrentOrg()`.
- Two more global guards run around auth: `LicensingGuard` (registered by
  `LicensingModule`, imported *before* `AuthModule`) blocks every non-`@Public()`
  route until the CodeCanyon purchase code is activated, but only when
  `NODE_ENV=production`; `SubscriptionGuard` (registered by `AuthModule`, last
  in its guard chain) enforces SaaS billing status and is a no-op in standalone
  mode. See `../DEPLOYMENT-AND-LICENSING-DEVELOPER.md` for the full chain.

### Data model

- Every person exists in **three places** that must stay in sync: Keycloak
  (identity), the Mongo `User` collection (app role + identity mirror), and — for
  customers — the Mongo `Customer` collection (profile). `keycloakId` is the join
  key across all three.
- `UsersService.getOrProvisionMe` lazily provisions/syncs a `User` from JWT claims
  on first `GET /users/me`. Staff created this way default to `AppRole.User`;
  customers created via the customers flow get `AppRole.Customer`. In
  standalone mode only, the very first caller ever (empty `users` collection)
  is auto-provisioned as `AppRole.Admin` instead — see
  `../DEPLOYMENT-AND-LICENSING-BUSINESS.md`.
- **Every tenant-owned record carries `organizationId`** (accounts, activities,
  automations, contacts, customers, kb, leads, opportunities, reports, teams,
  tickets, users). Standalone deployments have exactly one organization
  (auto-created); SaaS deployments have many, each independently billed —
  see `../DEPLOYMENT-AND-LICENSING-DEVELOPER.md`.
- **Row-level visibility:** customers carry `assignedToId` (staff keycloakId) and
  `assignedTeamId` (ref `Team`). Admin/Administrator see all records; `User` staff
  only see records they own, records routed to one of their active teams, or
  records they created (`CustomersService.buildVisibilityFilter`). Business rules
  are documented in `../TEAMS-AND-TERRITORIES.md` — keep code and doc in sync.
  Leads, opportunities, accounts, and contacts carry the same routing fields
  and replicate the same visibility filter in their services; business rules
  live in `../LEADS-AND-PIPELINE-BUSINESS.md` and
  `../CONTACTS-AND-ACCOUNTS-BUSINESS.md` (+ `-DEVELOPER.md` each).
- `AccountsModule` registers the Contact/Opportunity **schemas** directly
  (read/unlink-only: 360° summary, link counts, delete-time unlinking) instead
  of importing their modules — that direction would create a dependency cycle.
  `ActivitiesModule` does the same for all five linkable schemas; `ReportsModule`
  registers Opportunity/Lead/Customer/Activity/Ticket schemas read-only for its
  analytics aggregations. Completed
  communications feed lead engagements / contact interactions
  (`syncCompletedCommunication`) — business rules in
  `../ACTIVITIES-AND-ENGAGEMENT-BUSINESS.md`.
- Deliberately `@Public()` endpoints: `POST /leads/capture` (web-form lead
  ingestion: 202 + empty body, honeypot, dedupe) and the `GET /kb/public*` +
  `POST /kb/public/:id/feedback` FAQ surface (published+public articles only,
  no author metadata). `AppRole.Customer` gets the `/tickets/my*` portal
  routes (internal notes stripped, ownership checked).

### Writing that spans Keycloak + Mongo — follow the existing pattern

`CustomersService.create` is the reference implementation for multi-store writes:
create in Keycloak first, then Mongo `User`, then Mongo `Customer`, and on any Mongo
failure **roll back in reverse order** (delete customer doc, delete user doc, delete
Keycloak user). `update`/`remove` propagate email/name changes to all three stores.
When you touch a person's identity, keep all three consistent and preserve the
rollback discipline. Email sends are best-effort: log and swallow, never fail the
request because mail failed.

### Conventions

- **DTOs + validation:** every request body/query is a `class-validator` DTO. The
  global `ValidationPipe` uses `{ whitelist: true, transform: true }`, so unknown
  fields are stripped and query params are coerced. Add validation decorators to
  new DTOs.
- **Responses go through mappers.** Never return a raw Mongoose document — map to a
  `*-response.dto.ts` via the folder's `mappers/` (e.g. `toCustomerResponseDto`).
- **Schemas:** `@Schema({ timestamps: true })`, export `SchemaFactory.createForClass`
  and a `HydratedDocument<T>` type alias. Normalize identity fields (`lowercase`,
  `trim`) at the schema level.
- **Errors:** throw Nest HTTP exceptions (`ConflictException`, `NotFoundException`,
  `ForbiddenException`, …). Use a per-service `private readonly logger =
  new Logger(X.name)` for logging.
- Controllers stay thin — validate/authorize/delegate. Business logic lives in
  services.

## Gotchas

- The API globally sends `Cache-Control: no-store` and disables ETags (`main.ts`) —
  responses are intentionally uncached.
- `KeycloakAdminModule` and `EventsModule` are global; import their services
  without re-importing the module. `MailModule` is **not** global — import it
  where `MailService` is needed.
- When a service mutates leads/opportunities/customers/contacts in a new way,
  emit the matching `CrmEventBus` event after the save (see
  `../AUTOMATION-AND-WORKFLOWS-DEVELOPER.md` §1 for the emission map and the
  no-loop rule).
- `KeycloakAdminService` caches its admin token; it needs
  `KEYCLOAK_ADMIN_CLIENT_ID` / `KEYCLOAK_ADMIN_CLIENT_SECRET` (a confidential
  service-account client, distinct from the public `crm-frontend` client used to
  validate user tokens).
- No global route prefix is set — controllers own their full paths (e.g.
  `@Controller('auth/otp')`). The frontend no longer calls this server directly
  from the browser — it's a BFF now (see `../crm-frontend/CLAUDE.md`): browser
  requests hit the frontend's same-origin `/api/backend/*` proxy, which forwards
  to this server's root paths server-side. `next.config.ts` still rewrites
  `/files/*` and `/swagger/*` directly for same-origin asset/doc access.
- `KeycloakAdminService.sendSetPasswordEmail` passes `client_id`/`redirect_uri`
  so the user lands back on `/dashboard` after setting their password —
  without those params Keycloak strands them on its own generic account page.
- `DEPLOYMENT_MODE` defaults to `standalone` if unset (`getDeploymentMode` in
  `config/deployment-mode.ts`) — never read it via `process.env` or assume
  `saas`; always go through that helper.
