export class ContactStatsDto {
  total: number;
  /** Contacts linked to an account (B2B coverage). */
  withAccount: number;
  /** Contacts flagged do-not-contact. */
  doNotContact: number;
  newThisMonth: number;
  /** Interactions logged this month across visible contacts. */
  interactionsThisMonth: number;
}
