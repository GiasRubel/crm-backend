import { IsMongoId, IsOptional, IsString, ValidateIf } from 'class-validator';

/**
 * Reassignment payload. assignedToId is required on activities, so null is
 * not accepted for it here — reassign to a specific staff user instead.
 * assignedTeamId: omitted = unchanged, null = cleared, value = set.
 */
export class AssignActivityDto {
  /** keycloakId of the staff user to make responsible. */
  @IsString()
  @IsOptional()
  assignedToId?: string;

  @ValidateIf((o: AssignActivityDto) => o.assignedTeamId !== null)
  @IsMongoId()
  @IsOptional()
  assignedTeamId?: string | null;
}
