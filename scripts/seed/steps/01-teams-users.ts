/**
 * Step 01 — teams and staff users.
 *
 * Everything downstream draws its record owner from `ctx.pools.staff`, and
 * copies that owner's `teamId` onto the record. That is what keeps
 * `assignedToId` and `assignedTeamId` consistent: a record is never routed to
 * a team its owner doesn't belong to.
 */
import { Types } from 'mongoose';
import { AppRole } from '../../../src/users/app-role.enum';
import { Team, TeamDocument } from '../../../src/teams/team.schema';
import { User, UserDocument } from '../../../src/users/users.schema';
import { EMAIL_DOMAIN, REGIONS } from '../config';
import { model, SeedContext, StaffRef, TeamKind, TeamRef } from '../context';
import { SeedKeycloak } from '../keycloak';
import { faker, historyMoment, NOW } from '../rng';
import type { RegionKey } from '../config';

interface TeamSpec {
  name: string;
  description: string;
  kind: TeamKind;
  region: RegionKey;
  /** Headcount, including the lead. */
  size: number;
}

/**
 * Six teams sized like a real 100–200 person company: sales split by
 * territory, a two-tier support desk, and a customer success team.
 */
const TEAM_SPECS: TeamSpec[] = [
  {
    name: 'Sales — EMEA',
    description:
      'Enterprise and mid-market sales across Europe, Middle East and Africa.',
    kind: 'sales',
    region: 'emea',
    size: 6,
  },
  {
    name: 'Sales — AMER',
    description: 'Enterprise and mid-market sales across North America.',
    kind: 'sales',
    region: 'amer',
    size: 6,
  },
  {
    name: 'Sales — APAC',
    description: 'Sales coverage for Asia-Pacific accounts.',
    kind: 'sales',
    region: 'apac',
    size: 4,
  },
  {
    name: 'Support — Tier 1',
    description: 'First-line helpdesk: triage, how-to questions, billing.',
    kind: 'support',
    region: 'emea',
    size: 5,
  },
  {
    name: 'Support — Tier 2',
    description: 'Escalation desk: bugs, integrations, technical incidents.',
    kind: 'support',
    region: 'amer',
    size: 4,
  },
  {
    name: 'Customer Success',
    description: 'Onboarding, adoption and renewals for active accounts.',
    kind: 'success',
    region: 'amer',
    size: 3,
  },
];

/** Unique-email guard: two "Anna Schmidt"s must not collide. */
function emailFor(first: string, last: string, taken: Set<string>): string {
  const base = `${first}.${last}`
    .toLowerCase()
    .normalize('NFD')
    // strip combining diacritics, so "Müller" becomes "muller"
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z.]/g, '');
  let email = `${base}@${EMAIL_DOMAIN}`;
  let n = 2;
  while (taken.has(email)) {
    email = `${base}${n}@${EMAIL_DOMAIN}`;
    n += 1;
  }
  taken.add(email);
  return email;
}

export async function seedTeamsAndUsers(
  ctx: SeedContext,
  keycloak: SeedKeycloak,
): Promise<void> {
  const teamModel = model<TeamDocument>(ctx.app, Team.name);
  const userModel = model<UserDocument>(ctx.app, User.name);

  const takenEmails = new Set<string>();
  const teamRefs: TeamRef[] = [];
  const staffRefs: StaffRef[] = [];
  const userDocs: Record<string, unknown>[] = [];

  // The first person on each team is its lead and gets an admin-ish role;
  // exactly one PlatformAdmin exists, on the first team.
  let isFirstTeam = true;

  for (const spec of TEAM_SPECS) {
    const teamId = new Types.ObjectId();
    const memberIds: string[] = [];
    let leaderId: string | undefined;

    for (let i = 0; i < spec.size; i++) {
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const email = emailFor(firstName, lastName, takenEmails);

      const role =
        isFirstTeam && i === 0
          ? AppRole.PlatformAdmin
          : i === 0
            ? AppRole.Admin
            : AppRole.User;

      const keycloakId = await keycloak.provision({
        email,
        firstName,
        lastName,
      });
      memberIds.push(keycloakId);
      if (i === 0) leaderId = keycloakId;

      staffRefs.push({
        keycloakId,
        firstName,
        lastName,
        email,
        role,
        teamId,
        teamKind: spec.kind,
        region: spec.region,
      });

      userDocs.push({
        _id: new Types.ObjectId(),
        organizationId: ctx.organizationId,
        keycloakId,
        email,
        username: email,
        firstName,
        lastName,
        role,
        createdAt: historyMoment(),
        updatedAt: NOW,
      });

      ctx.logger.log(`  provisioned ${email} (${role})`);
    }

    teamRefs.push({
      id: teamId,
      name: spec.name,
      kind: spec.kind,
      region: spec.region,
      memberIds,
    });

    const createdAt = historyMoment();
    await ctx.insert('teams', teamModel, [
      {
        _id: teamId,
        organizationId: ctx.organizationId,
        name: spec.name,
        description: spec.description,
        regions: [...REGIONS[spec.region]],
        leaderId,
        memberIds,
        isActive: true,
        createdBy: leaderId,
        createdAt,
        updatedAt: createdAt,
      },
    ]);

    isFirstTeam = false;
  }

  // Users are inserted after all teams so a failed team insert doesn't leave
  // orphaned user docs pointing at a team that was never created.
  await ctx.insert('users', userModel, userDocs);

  ctx.pools.teams = teamRefs;
  ctx.pools.staff = staffRefs;
}
