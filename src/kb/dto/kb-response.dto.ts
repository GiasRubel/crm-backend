import type { KbStatus, KbVisibility } from '../kb-article.schema';

export class KbArticleResponseDto {
  id: string;
  title: string;
  slug: string;
  body: string;
  category: string | null;
  tags: string[];
  status: KbStatus;
  visibility: KbVisibility;
  authorId: string;
  authorName: string | null;
  updatedById: string | null;
  updatedByName: string | null;
  publishedAt: string | null;
  views: number;
  helpfulCount: number;
  notHelpfulCount: number;
  createdAt: string;
  updatedAt: string;
}

/** What anonymous FAQ visitors see — no author identifiers or counters. */
export class PublicKbArticleDto {
  id: string;
  title: string;
  slug: string;
  body: string;
  category: string | null;
  tags: string[];
  publishedAt: string | null;
  helpfulCount: number;
  notHelpfulCount: number;
}

export class KbStatsDto {
  total: number;
  published: number;
  drafts: number;
  archived: number;
  publicArticles: number;
  totalViews: number;
}
