import { IsMongoId, IsOptional, IsString } from 'class-validator';

/**
 * Record routing payload (same semantics as AssignCustomerDto):
 * - omitted  → unchanged
 * - null     → cleared (back to unassigned)
 * - a value  → validated and set
 */
export class AssignLeadDto {
  /** keycloakId of the staff user to set as record owner. */
  @IsString()
  @IsOptional()
  assignedToId?: string | null;

  /** Team id to route the record to. */
  @IsMongoId()
  @IsOptional()
  assignedTeamId?: string | null;
}
