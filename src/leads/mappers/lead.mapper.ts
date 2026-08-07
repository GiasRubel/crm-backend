import { Lead, LeadDocument, LEAD_RATING_THRESHOLDS } from '../lead.schema';
import { LeadRating } from '../dto/lead-query.dto';
import { LeadResponseDto } from '../dto/lead-response.dto';

export interface LeadLookupNames {
  /** keycloakId → staff display name */
  staffNames?: Map<string, string>;
  /** teamId → team name */
  teamNames?: Map<string, string>;
}

export function ratingForScore(score: number): LeadRating {
  if (score >= LEAD_RATING_THRESHOLDS.hot) return 'hot';
  if (score >= LEAD_RATING_THRESHOLDS.warm) return 'warm';
  return 'cold';
}

export function toLeadResponseDto(
  lead: LeadDocument,
  names: LeadLookupNames = {},
): LeadResponseDto {
  const assignedToId = lead.assignedToId ?? null;
  const assignedTeamId = lead.assignedTeamId?.toString() ?? null;

  return {
    id: lead._id.toString(),
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    phone: lead.phone,
    company: lead.company,
    jobTitle: lead.jobTitle,
    notes: lead.notes,
    source: lead.source,
    status: lead.status,
    score: lead.score,
    rating: ratingForScore(lead.score),
    engagements: [...lead.engagements]
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .map((e) => ({
        type: e.type,
        points: e.points,
        note: e.note,
        recordedBy: e.recordedBy,
        recordedByName:
          (e.recordedBy && names.staffNames?.get(e.recordedBy)) || null,
        occurredAt: e.occurredAt.toISOString(),
      })),
    estimatedValue: lead.estimatedValue,
    createdBy: lead.createdBy,
    assignedToId,
    assignedToName:
      (assignedToId && names.staffNames?.get(assignedToId)) || null,
    assignedTeamId,
    assignedTeamName:
      (assignedTeamId && names.teamNames?.get(assignedTeamId)) || null,
    convertedCustomerId: lead.convertedCustomerId?.toString() ?? null,
    convertedOpportunityId: lead.convertedOpportunityId?.toString() ?? null,
    convertedAt: lead.convertedAt?.toISOString() ?? null,
    convertedBy: lead.convertedBy ?? null,
    customFields: lead.customFields ?? {},
    createdAt: lead.createdAt?.toISOString() ?? '',
    updatedAt: lead.updatedAt?.toISOString() ?? '',
  };
}

/** Score sum from engagement points, clamped to the 0–100 band. */
export function computeScore(lead: Pick<Lead, 'engagements'>): number {
  const sum = lead.engagements.reduce((acc, e) => acc + e.points, 0);
  return Math.max(0, Math.min(100, sum));
}
