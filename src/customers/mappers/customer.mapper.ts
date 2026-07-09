import { CustomerDocument } from '../customer.schema';
import { CustomerResponseDto } from '../dto/customer-response.dto';

export interface CustomerAssignmentNames {
  /** keycloakId → staff display name */
  ownerNames?: Map<string, string>;
  /** teamId → team name */
  teamNames?: Map<string, string>;
}

export function toCustomerResponseDto(
  customer: CustomerDocument,
  names: CustomerAssignmentNames = {},
): CustomerResponseDto {
  const assignedToId = customer.assignedToId ?? null;
  const assignedTeamId = customer.assignedTeamId?.toString() ?? null;

  return {
    id: customer._id.toString(),
    keycloakId: customer.keycloakId,
    email: customer.email,
    firstName: customer.firstName,
    lastName: customer.lastName,
    phone: customer.phone,
    company: customer.company,
    address: customer.address,
    notes: customer.notes,
    status: customer.status,
    createdBy: customer.createdBy,
    assignedToId,
    assignedToName:
      (assignedToId && names.ownerNames?.get(assignedToId)) || null,
    assignedTeamId,
    assignedTeamName:
      (assignedTeamId && names.teamNames?.get(assignedTeamId)) || null,
    createdAt: customer.createdAt?.toISOString() ?? '',
    updatedAt: customer.updatedAt?.toISOString() ?? '',
  };
}
