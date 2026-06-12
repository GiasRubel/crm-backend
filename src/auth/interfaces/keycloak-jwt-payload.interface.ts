export interface KeycloakJwtPayload {
  sub: string;
  email?: string;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
  azp?: string;
  iss?: string;
  exp?: number;
  iat?: number;
}
