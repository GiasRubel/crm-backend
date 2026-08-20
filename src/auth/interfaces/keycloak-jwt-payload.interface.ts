export interface KeycloakJwtPayload {
  sub: string;
  email?: string;
  /**
   * Keycloak's `email_verified` claim. Provisioning REQUIRES this to be true:
   * an unverified email address proves nothing about who owns it, and the
   * provisioning path keys on the address. Local-auth tokens set it to true
   * explicitly — those passwords were verified against our own database.
   */
  email_verified?: boolean;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
  azp?: string;
  iss?: string;
  exp?: number;
  iat?: number;
  /** Present when the user authenticated via a Keycloak Identity Provider (e.g. google, facebook) */
  identity_provider?: string;
}
