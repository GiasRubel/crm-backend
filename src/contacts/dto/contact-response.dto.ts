import type {
  InteractionDirection,
  InteractionType,
  PreferredChannel,
} from '../contact.schema';

export class ContactInteractionResponseDto {
  type: InteractionType;
  direction: InteractionDirection | null;
  subject: string | null;
  note: string | null;
  recordedBy: string;
  recordedByName: string | null;
  occurredAt: string;
}

export class ContactResponseDto {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  jobTitle: string | null;
  department: string | null;
  birthday: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  language: string | null;
  accountId: string | null;
  accountName: string | null;
  isPrimary: boolean;
  customerId: string | null;
  preferredChannel: PreferredChannel;
  emailOptIn: boolean;
  phoneOptIn: boolean;
  smsOptIn: boolean;
  doNotContact: boolean;
  interactions: ContactInteractionResponseDto[];
  notes: string | null;
  createdBy: string;
  assignedToId: string | null;
  assignedToName: string | null;
  assignedTeamId: string | null;
  assignedTeamName: string | null;
  customFields: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
