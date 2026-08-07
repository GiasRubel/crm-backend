import type {
  CommentAuthorRole,
  TicketPriority,
  TicketStatus,
  TicketType,
} from '../ticket.schema';

export class TicketCommentResponseDto {
  authorId: string;
  authorRole: CommentAuthorRole;
  authorName: string | null;
  body: string;
  isInternal: boolean;
  postedAt: string;
}

export class LinkedArticleDto {
  id: string;
  title: string;
}

export class TicketResponseDto {
  id: string;
  number: string;
  subject: string;
  description: string;
  type: TicketType;
  status: TicketStatus;
  priority: TicketPriority;
  customerId: string;
  customerName: string | null;
  /** Internal comments are stripped for customer-facing responses. */
  comments: TicketCommentResponseDto[];
  relatedArticles: LinkedArticleDto[];
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdBy: string;
  assignedToId: string | null;
  assignedToName: string | null;
  assignedTeamId: string | null;
  assignedTeamName: string | null;
  customFields: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export class TicketStatsDto {
  open: number;
  inProgress: number;
  waitingOnCustomer: number;
  unassigned: number;
  urgent: number;
  /** Active tickets with no staff response yet. */
  awaitingFirstResponse: number;
  resolvedThisMonth: number;
  /** Mean hours from creation to first staff response (this month). */
  avgFirstResponseHours: number | null;
}
