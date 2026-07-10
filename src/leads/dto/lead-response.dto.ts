import { LeadSource, LeadStatus, EngagementType } from '../lead.schema';
import { LeadRating } from './lead-query.dto';

export class LeadEngagementResponseDto {
  type: EngagementType;
  points: number;
  note?: string;
  recordedBy?: string;
  recordedByName: string | null;
  occurredAt: string;
}

export class LeadResponseDto {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  company?: string;
  jobTitle?: string;
  notes?: string;
  source: LeadSource;
  status: LeadStatus;
  score: number;
  /** Derived from score: hot ≥ 70, warm ≥ 40, else cold. */
  rating: LeadRating;
  engagements: LeadEngagementResponseDto[];
  estimatedValue?: number;
  createdBy: string;
  assignedToId: string | null;
  assignedToName: string | null;
  assignedTeamId: string | null;
  assignedTeamName: string | null;
  convertedCustomerId: string | null;
  convertedOpportunityId: string | null;
  convertedAt: string | null;
  convertedBy: string | null;
  createdAt: string;
  updatedAt: string;
}
