import { TicketDocument } from '../ticket.schema';
import { TicketResponseDto } from '../dto/ticket-response.dto';

export interface TicketLookupData {
  /** keycloakId → staff display name */
  staffNames?: Map<string, string>;
  /** teamId → team name */
  teamNames?: Map<string, string>;
  /** customerId → customer display name */
  customerNames?: Map<string, string>;
  /** articleId → article title */
  articleTitles?: Map<string, string>;
  /** Customer-facing view: internal notes are stripped. */
  forCustomer?: boolean;
}

export function toTicketResponseDto(
  ticket: TicketDocument,
  data: TicketLookupData = {},
): TicketResponseDto {
  const assignedToId = ticket.assignedToId ?? null;
  const assignedTeamId = ticket.assignedTeamId?.toString() ?? null;
  const customerId = ticket.customerId.toString();
  const customerName = data.customerNames?.get(customerId) ?? null;

  const comments = ticket.comments
    .filter((c) => !data.forCustomer || !c.isInternal)
    .map((c) => ({
      authorId: c.authorId,
      authorRole: c.authorRole,
      authorName:
        c.authorRole === 'staff'
          ? (data.staffNames?.get(c.authorId) ?? null)
          : customerName,
      body: c.body,
      isInternal: c.isInternal,
      postedAt: c.postedAt.toISOString(),
    }))
    .sort((a, b) => a.postedAt.localeCompare(b.postedAt));

  return {
    id: ticket._id.toString(),
    number: ticket.number,
    subject: ticket.subject,
    description: ticket.description,
    type: ticket.type,
    status: ticket.status,
    priority: ticket.priority,
    customerId,
    customerName,
    comments,
    relatedArticles: ticket.relatedArticleIds.map((id) => ({
      id: id.toString(),
      title: data.articleTitles?.get(id.toString()) ?? 'Untitled article',
    })),
    firstResponseAt: ticket.firstResponseAt?.toISOString() ?? null,
    resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
    closedAt: ticket.closedAt?.toISOString() ?? null,
    createdBy: ticket.createdBy,
    assignedToId,
    assignedToName:
      (assignedToId && data.staffNames?.get(assignedToId)) || null,
    assignedTeamId,
    assignedTeamName:
      (assignedTeamId && data.teamNames?.get(assignedTeamId)) || null,
    customFields: ticket.customFields ?? {},
    createdAt: ticket.createdAt?.toISOString() ?? '',
    updatedAt: ticket.updatedAt?.toISOString() ?? '',
  };
}
