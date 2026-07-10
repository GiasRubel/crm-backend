import { ContactDocument } from '../contact.schema';
import { ContactResponseDto } from '../dto/contact-response.dto';

export interface ContactLookupNames {
  /** keycloakId → staff display name */
  staffNames?: Map<string, string>;
  /** teamId → team name */
  teamNames?: Map<string, string>;
  /** accountId → account name */
  accountNames?: Map<string, string>;
}

export function toContactResponseDto(
  contact: ContactDocument,
  names: ContactLookupNames = {},
): ContactResponseDto {
  const assignedToId = contact.assignedToId ?? null;
  const assignedTeamId = contact.assignedTeamId?.toString() ?? null;
  const accountId = contact.accountId?.toString() ?? null;

  return {
    id: contact._id.toString(),
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.email,
    phone: contact.phone ?? null,
    jobTitle: contact.jobTitle ?? null,
    department: contact.department ?? null,
    birthday: contact.birthday?.toISOString() ?? null,
    address: contact.address ?? null,
    city: contact.city ?? null,
    country: contact.country ?? null,
    language: contact.language ?? null,
    accountId,
    accountName: (accountId && names.accountNames?.get(accountId)) || null,
    isPrimary: contact.isPrimary,
    customerId: contact.customerId?.toString() ?? null,
    preferredChannel: contact.preferredChannel,
    emailOptIn: contact.emailOptIn,
    phoneOptIn: contact.phoneOptIn,
    smsOptIn: contact.smsOptIn,
    doNotContact: contact.doNotContact,
    interactions: [...contact.interactions]
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .map((i) => ({
        type: i.type,
        direction: i.direction ?? null,
        subject: i.subject ?? null,
        note: i.note ?? null,
        recordedBy: i.recordedBy,
        recordedByName: names.staffNames?.get(i.recordedBy) ?? null,
        occurredAt: i.occurredAt.toISOString(),
      })),
    notes: contact.notes ?? null,
    createdBy: contact.createdBy,
    assignedToId,
    assignedToName:
      (assignedToId && names.staffNames?.get(assignedToId)) || null,
    assignedTeamId,
    assignedTeamName:
      (assignedTeamId && names.teamNames?.get(assignedTeamId)) || null,
    createdAt: contact.createdAt?.toISOString() ?? '',
    updatedAt: contact.updatedAt?.toISOString() ?? '',
  };
}
