export const SEARCH_RESULT_TYPES = [
  'lead',
  'contact',
  'account',
  'opportunity',
  'customer',
  'ticket',
  'kb_article',
] as const;
export type SearchResultType = (typeof SEARCH_RESULT_TYPES)[number];

export class SearchResultDto {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle?: string;
}
