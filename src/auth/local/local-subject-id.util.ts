import { randomUUID } from 'crypto';

/**
 * Stable, unique `keycloakId`-shaped subject for a user that has no real
 * Keycloak identity (local-auth organizations). Plain function, not a
 * provider — safe to import from any module without affecting the DI graph.
 */
export function generateLocalSubjectId(): string {
  return `local:${randomUUID()}`;
}
