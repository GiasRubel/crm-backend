import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Account, AccountDocument } from '../accounts/account.schema';
import { Contact, ContactDocument } from '../contacts/contact.schema';
import { Customer, CustomerDocument } from '../customers/customer.schema';
import { KbArticle, KbArticleDocument } from '../kb/kb-article.schema';
import { Lead, LeadDocument } from '../leads/lead.schema';
import {
  Opportunity,
  OpportunityDocument,
} from '../opportunities/opportunity.schema';
import { Ticket, TicketDocument } from '../tickets/ticket.schema';
import { SearchResultDto } from './dto/search-result.dto';

/** Escape user input so it can be safely embedded in a RegExp. */
function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class SearchService {
  constructor(
    @InjectModel(Lead.name) private readonly leadModel: Model<LeadDocument>,
    @InjectModel(Contact.name)
    private readonly contactModel: Model<ContactDocument>,
    @InjectModel(Account.name)
    private readonly accountModel: Model<AccountDocument>,
    @InjectModel(Opportunity.name)
    private readonly opportunityModel: Model<OpportunityDocument>,
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
    @InjectModel(Ticket.name)
    private readonly ticketModel: Model<TicketDocument>,
    @InjectModel(KbArticle.name)
    private readonly kbArticleModel: Model<KbArticleDocument>,
  ) {}

  async search(
    q: string,
    organizationId: Types.ObjectId,
    limit: number,
  ): Promise<SearchResultDto[]> {
    const term = q.trim();
    if (term.length < 2) return [];
    const regex = new RegExp(escapeRegExp(term), 'i');

    const [leads, contacts, accounts, opportunities, customers, tickets, kb] =
      await Promise.all([
        this.leadModel
          .find({
            organizationId,
            $or: [
              { firstName: regex },
              { lastName: regex },
              { email: regex },
              { company: regex },
              { phone: regex },
            ],
          })
          .sort({ updatedAt: -1 })
          .limit(limit)
          .exec(),
        this.contactModel
          .find({
            organizationId,
            $or: [
              { firstName: regex },
              { lastName: regex },
              { email: regex },
              { jobTitle: regex },
              { phone: regex },
            ],
          })
          .sort({ updatedAt: -1 })
          .limit(limit)
          .exec(),
        this.accountModel
          .find({
            organizationId,
            $or: [{ name: regex }, { website: regex }, { email: regex }],
          })
          .sort({ updatedAt: -1 })
          .limit(limit)
          .exec(),
        this.opportunityModel
          .find({ organizationId, name: regex })
          .sort({ updatedAt: -1 })
          .limit(limit)
          .exec(),
        this.customerModel
          .find({
            organizationId,
            $or: [
              { firstName: regex },
              { lastName: regex },
              { email: regex },
              { company: regex },
              { phone: regex },
            ],
          })
          .sort({ updatedAt: -1 })
          .limit(limit)
          .exec(),
        this.ticketModel
          .find({
            organizationId,
            $or: [{ number: regex }, { subject: regex }],
          })
          .sort({ updatedAt: -1 })
          .limit(limit)
          .exec(),
        this.kbArticleModel
          .find({ organizationId, title: regex })
          .sort({ updatedAt: -1 })
          .limit(limit)
          .exec(),
      ]);

    return [
      ...leads.map((l) => ({
        type: 'lead' as const,
        id: l._id.toString(),
        title: `${l.firstName} ${l.lastName}`,
        subtitle: l.company || l.email,
      })),
      ...contacts.map((c) => ({
        type: 'contact' as const,
        id: c._id.toString(),
        title: `${c.firstName} ${c.lastName}`,
        subtitle: c.jobTitle || c.email,
      })),
      ...accounts.map((a) => ({
        type: 'account' as const,
        id: a._id.toString(),
        title: a.name,
        subtitle: a.website || a.email,
      })),
      ...opportunities.map((o) => ({
        type: 'opportunity' as const,
        id: o._id.toString(),
        title: o.name,
        subtitle: o.stage,
      })),
      ...customers.map((c) => ({
        type: 'customer' as const,
        id: c._id.toString(),
        title: `${c.firstName} ${c.lastName}`,
        subtitle: c.company || c.email,
      })),
      ...tickets.map((t) => ({
        type: 'ticket' as const,
        id: t._id.toString(),
        title: `${t.number} — ${t.subject}`,
        subtitle: t.status,
      })),
      ...kb.map((k) => ({
        type: 'kb_article' as const,
        id: k._id.toString(),
        title: k.title,
        subtitle: k.category,
      })),
    ];
  }
}
