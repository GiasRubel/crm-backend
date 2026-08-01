# Seed Data Plan — production-grade demo dataset

Goal: fill every backend module with a coherent, ~18-month history for one
medium-sized company (100–200 employees), so every list, board, dashboard,
report and SLA sweep has realistic data behind it.

- **Window**: 2025-02-01 → 2026-08-01 (18 months), volume ramping upward.
- **Tenant**: the existing default Organization (standalone mode). No new org.
- **Identities**: all staff provisioned in Keycloak (real logins); customers get
  synthetic `keycloakId`s except 10 real portal logins.
- **Re-runs**: appends by default; `--fresh` removes only previously seeded data.

---

## 1. Volumes

| Collection | Count | Notes |
| --- | ---: | --- |
| `organizations` | 1 (reuse) | existing default org |
| `teams` | 6 | 3 sales, 2 support, 1 customer success |
| `users` (staff) | 28 | 1 PlatformAdmin, 3 Admin, 24 User — all in Keycloak |
| `accounts` | 180 | firmographic mix across 9 industries, 6 size bands |
| `contacts` | 650 | ~3.6/account, exactly 1 primary per account |
| `customers` | 240 | 162 from lead conversion + 78 direct |
| `leads` | 900 | full status funnel, scored from engagements |
| `opportunities` | 420 | 120 open, 180 won, 120 lost |
| `activities` | ~6 000 | tasks + logged comms across all 6 related types |
| `tickets` | 1 400 | numbered TKT-1001…, threaded comments |
| `ticketcounters` | 1 | seq advanced to match |
| `kbarticles` | 60 | 25 public FAQ, 20 internal, 10 draft, 5 archived |
| `automationrules` | 12 | 8 trigger + 4 SLA |
| `automationruns` | ~800 | referencing real records |
| `savedreports` | 15 | across the report datasets |
| `subscriptions` | 1 (reuse) | existing |

Total ≈ 11 000 documents. Expected runtime 1–2 min (Keycloak user creation is
the slow part, ~30 s).

---

## 2. Coherence rules (what makes it "production grade")

These are the invariants the seeder must satisfy — random data that violates
them makes dashboards and reports look broken.

**Ownership & visibility**
- Every record's `assignedToId` is a real staff `keycloakId`, and
  `assignedTeamId` is a team that user is actually a member of.
- Sales records (accounts/contacts/leads/opportunities) route to sales teams;
  tickets route to support teams; `createdBy` is a staff id or a `system:*` tag.
- Each team's `leaderId` is always present in its own `memberIds`.

**Lead funnel**
- `score` = clamped 0–100 sum of that lead's `engagements[].points`, so the
  derived hot/warm/cold rating is consistent with the timeline.
- Engagement `occurredAt` values fall between `createdAt` and now, in order.
- Exactly the `converted` leads carry `convertedCustomerId`,
  `convertedOpportunityId`, `convertedAt`, `convertedBy`; the referenced
  Opportunity carries the matching `leadId`. Non-converted leads carry none.
- `source` mix: web_form 35%, manual 25%, referral 15%, event 12%, api 8%,
  other 5%. `system:web-form` / `system:api` used as `createdBy` for those.

**Pipeline**
- `probability` always equals `STAGE_PROBABILITY[stage]`.
- `stageHistory` is a forward-only path (discovery → proposal → …) with strictly
  increasing `movedAt`, and its last `to` equals the current `stage`.
- Closed deals have `closedAt`; every `closed_lost` has a `lostReason`.
- Open deals have `expectedCloseDate` in the future; won/lost ones in the past.
- Amount drawn by account size band: 1–50 emp → 2k–15k, 51–500 → 15k–80k,
  500+ → 80k–400k. Win rate ~60% of closed, so the funnel report looks sane.

**Accounts & contacts**
- `annualRevenue` correlates with the employee-count band.
- One `isPrimary: true` contact per account, the rest false.
- ~8% `doNotContact: true` (with opt-ins forced off), realistic channel mix.
- Contacts converted from leads link to their `Customer` via `customerId`.

**Service**
- Tickets belong to real customers; `number` comes from a `ticketcounters` doc
  seeded to the right `seq`.
- Timestamps monotone: `createdAt` ≤ `firstResponseAt` ≤ `resolvedAt` ≤ `closedAt`,
  and only set for statuses that have reached that point.
- 1–8 comments alternating customer/staff, ~20% `isInternal`; the first public
  staff comment is exactly `firstResponseAt`.
- Status mix: open 8%, in_progress 10%, waiting_on_customer 7%, resolved 45%,
  closed 30%. Priority mix weighted to normal, a few urgent still open.
- ~30% of tickets link 1–2 `relatedArticleIds` to published KB articles.

**Activities**
- 55% completed in the past, 25% pending with future `dueAt`/`remindAt`,
  12% pending overdue (so the reminders feed has content), 8% cancelled.
- `relatedType`/`relatedId` point at documents that actually exist.
- Meetings/calls have `startAt` < `endAt`; tasks have `dueAt` only.
- `syncedToRecord: true` only where a matching entry was really written into the
  linked lead's `engagements` or contact's `interactions`.

**Automation**
- Rules use real `CRM_EVENTS` values and valid condition fields.
- `runCount` equals the number of `automationruns` written for that rule, and
  `lastRunAt` equals the newest run's timestamp.
- Runs reference existing `recordId`s with a denormalized `recordName`.

**Temporal realism**
- Timestamps land on weekdays, business hours, in the record's own timezone-ish
  band; monthly volume ramps ~1.6× from month 1 to month 18 so trend charts rise.

---

## 3. Implementation approach

**Write path — Mongoose models, not services.** The seeder pulls models out of
the Nest application context (`getModelToken`) and uses
`insertMany(docs, { timestamps: false })`. This is deliberate:

- Services would stamp `createdAt = now`, destroying the 18-month history.
- Services emit `CrmEventBus` events, which would fire the automation engine and
  generate uncontrolled side-effects mid-seed. We author `automationruns`
  explicitly instead.
- Bulk inserts are ~50× faster than per-record service calls.

The cost is that service-level invariants aren't enforced for us — which is why
section 2 exists as an explicit checklist, plus a verification step (todo 13).

**Determinism.** `@faker-js/faker` as a devDependency with a fixed
`faker.seed(20260801)` and a seeded PRNG for all weighted picks, so two runs
produce byte-identical data and bug reports are reproducible.

**Seed marker & `--fresh`.** No schema changes. The seeder writes a
`seed_manifest` collection recording, per run, the inserted `_id`s per collection
and the Keycloak ids it created. `--fresh` reads the manifest, deletes exactly
those documents, deletes those Keycloak users, then drops the manifest. Your 8
existing users, the org and the subscription are never touched.

**File layout** (new, under `scripts/seed/`):

```
scripts/seed/
  index.ts             # entry: flags, Nest context, step orchestration, summary table
  config.ts            # volumes, date window, RNG seed, dev password
  rng.ts               # seeded faker + pick/weighted/businessHoursDate helpers
  manifest.ts          # seed_manifest read/write + --fresh teardown
  keycloak.ts          # staff + portal-customer provisioning via KeycloakAdminService
  steps/
    01-teams-users.ts
    02-accounts-contacts.ts
    03-leads.ts
    04-customers-conversions.ts
    05-opportunities.ts
    06-kb.ts
    07-tickets.ts
    08-activities.ts
    09-automations.ts
    10-saved-reports.ts
  verify.ts            # post-seed integrity assertions (section 2 as code)
```

**Scripts** added to `package.json`:

```jsonc
"seed":        "ts-node -r tsconfig-paths/register scripts/seed/index.ts",
"seed:fresh":  "ts-node -r tsconfig-paths/register scripts/seed/index.ts --fresh",
"seed:verify": "ts-node -r tsconfig-paths/register scripts/seed/index.ts --verify-only"
```

**Staff logins.** All 28 staff share a dev password (`SEED_PASSWORD`, default
`Passw0rd!23`) with emails like `amara.osei@northwind-demo.test`, so you can log
in as an admin, a sales manager, a rep or a support agent to test row-level
visibility. The seeder prints the credential table at the end.

---

## 4. Risks / things to confirm during build

- `Team.name`, `KbArticle.slug`, `Customer.email`, `Customer.keycloakId` and
  `Ticket.number` have **unique indexes** — all generated values must be
  deduped before insert, or `insertMany` fails partway.
- `savedreports` definitions are re-validated by the report engine at run time,
  so dataset/field names must be read from `reports/report-datasets.ts` rather
  than invented (todo 11).
- Keycloak user creation is rate-limited in practice; provisioning runs
  sequentially with a small concurrency cap and is resumable via the manifest.
- 6 000 activities × polymorphic links means the id pools from earlier steps must
  be held in memory and passed forward — steps are ordered, not parallel.

---

## 5. Todo list

1. Add `@faker-js/faker` devDependency; add `seed`, `seed:fresh`, `seed:verify` scripts.
2. Build the harness: `config.ts` (volumes/window/seed), `rng.ts` (seeded faker + weighted pick + business-hours date ramp), `index.ts` (Nest context bootstrap, flag parsing, step runner, summary table).
3. Build `manifest.ts` — `seed_manifest` collection, id tracking, and `--fresh` teardown incl. Keycloak users.
4. Step 01 — 6 teams + 28 staff users: Keycloak provisioning, Mongo `users` docs, role mix, leader/member integrity, ownership pools per team.
5. Step 02 — 180 accounts + 650 contacts: firmographics, revenue↔size correlation, one primary per account, preferences/opt-ins, 0–6 interactions each.
6. Step 03 — 900 leads: source/status mix, engagement timelines with score = clamped sum, estimated values, `system:*` creators for web_form/api.
7. Step 04 — 240 customers: 162 from lead conversions (back-linking `convertedCustomerId`/`convertedAt`/`convertedBy`) + 78 direct; 10 real Keycloak portal logins; link matching contacts via `customerId`.
8. Step 05 — 420 opportunities: stage mix, `stageHistory` forward path, probability sync, close dates, lost reasons, amounts by account band, `leadId` back-links.
9. Step 06 — 60 KB articles: unique slugs, status/visibility mix, categories/tags, view and helpful counters.
10. Step 07 — 1 400 tickets + `ticketcounters`: numbering, status/priority mix, monotone SLA timestamps, threaded comments with internal notes, related KB articles.
11. Step 08 — ~6 000 activities: type/status/priority mix, future and overdue reminders, polymorphic links to real records, `syncedToRecord` consistent with the histories written in steps 02/03.
12. Step 09 — 12 automation rules + ~800 runs: real `CRM_EVENTS` triggers, valid condition fields, `runCount`/`lastRunAt` reconciled with the runs.
13. Step 10 — 15 saved reports: read `reports/report-datasets.ts` first and only use valid dataset/field/metric names; mix of shared and private.
14. Write `verify.ts` — assert every invariant in section 2, plus referential integrity (no dangling `accountId`/`customerId`/`relatedId`), and fail loudly with counts.
15. Run `yarn seed:fresh`, fix fallout, then verify through the API: dashboards, pipeline Kanban, reports, ticket SLA views, reminders feed.
16. Document usage in `crm-backend/README.md` (or `CLAUDE.md`) — how to seed, reset, and the staff credential table.
