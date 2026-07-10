import { IsMongoId, IsOptional, IsString, ValidateIf } from 'class-validator';

/**
 * Record routing payload (same semantics as AssignCustomerDto):
 * - omitted  → unchanged
 * - null     → cleared (back to unassigned)
 * - a value  → validated and set
 */
export class AssignTicketDto {
  /** keycloakId of the staff user to set as ticket owner. */
  @IsString()
  @IsOptional()
  assignedToId?: string | null;

  /** Team id to route the ticket to. */
  @ValidateIf((o: AssignTicketDto) => o.assignedTeamId !== null)
  @IsMongoId()
  @IsOptional()
  assignedTeamId?: string | null;
}
