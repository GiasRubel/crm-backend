/**
 * Keycloak provisioning for the seeder.
 *
 * Users are created sequentially and the manifest is flushed after each one:
 * Keycloak's admin API has no transaction, so a crash halfway through must
 * still leave every created account recoverable by `--fresh`.
 */
import { INestApplicationContext } from '@nestjs/common';
import { KeycloakAdminService } from '../../src/keycloak-admin/keycloak-admin.service';
import { SEED_PASSWORD } from './config';
import { SeedManifest } from './manifest';

export interface ProvisionRequest {
  email: string;
  firstName: string;
  lastName: string;
}

export class SeedKeycloak {
  private readonly admin: KeycloakAdminService;

  constructor(
    app: INestApplicationContext,
    private readonly manifest: SeedManifest,
  ) {
    this.admin = app.get(KeycloakAdminService);
  }

  /**
   * Creates a Keycloak account with the shared seed password and returns its
   * id. A 409 means a previous seed run left this user behind — the caller
   * should reset rather than silently adopting an account we don't own.
   */
  async provision(req: ProvisionRequest): Promise<string> {
    let keycloakId: string;
    try {
      keycloakId = await this.admin.createUser(
        req.email,
        req.firstName,
        req.lastName,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('already exists')) {
        throw new Error(
          `Keycloak already has a user for ${req.email}. A previous seed run ` +
            `was not cleaned up — run "yarn seed:reset" first.`,
        );
      }
      throw error;
    }

    this.manifest.trackKeycloak(keycloakId);
    await this.manifest.flush();

    await this.admin.resetPassword(keycloakId, SEED_PASSWORD);
    return keycloakId;
  }

  /** Bound deleter for the `--fresh` teardown. */
  get deleter(): (id: string) => Promise<void> {
    return (id: string) => this.admin.deleteUser(id);
  }
}
