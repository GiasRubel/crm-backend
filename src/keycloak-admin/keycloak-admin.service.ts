import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class KeycloakAdminService {
  private readonly logger = new Logger(KeycloakAdminService.name);

  private readonly authServerUrl: string;
  private readonly realm: string;
  private readonly clientId: string;
  private readonly clientSecret: string;

  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(private readonly config: ConfigService) {
    this.authServerUrl = this.config.getOrThrow<string>('KEYCLOAK_AUTH_SERVER_URL');
    this.realm = this.config.getOrThrow<string>('KEYCLOAK_REALM');
    this.clientId = this.config.getOrThrow<string>('KEYCLOAK_ADMIN_CLIENT_ID');
    this.clientSecret = this.config.getOrThrow<string>('KEYCLOAK_ADMIN_CLIENT_SECRET');
  }

  /**
   * Reset a Keycloak user's password permanently (non-temporary).
   * Used by the Forgot Password flow after OTP is verified.
   */
  async resetPassword(keycloakId: string, newPassword: string): Promise<void> {
    const token = await this.getAdminToken();
    const url = `${this.authServerUrl}/admin/realms/${this.realm}/users/${keycloakId}/reset-password`;

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'password',
        value: newPassword,
        temporary: false,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`Keycloak reset-password failed: ${res.status} ${body}`);
      throw new InternalServerErrorException('Failed to update password. Please try again.');
    }

    this.logger.log(`Password reset for Keycloak user ${keycloakId}`);
  }

  /**
   * Create a Keycloak user and return their Keycloak user ID.
   * Used by the Customer module.
   */
  async createUser(email: string, firstName: string, lastName: string): Promise<string> {
    const token = await this.getAdminToken();
    const url = `${this.authServerUrl}/admin/realms/${this.realm}/users`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        firstName,
        lastName,
        username: email,
        enabled: true,
        emailVerified: false,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`Keycloak createUser failed: ${res.status} ${body}`);
      throw new InternalServerErrorException('Failed to create user in Keycloak.');
    }

    // Keycloak returns the new user ID in the Location header
    const location = res.headers.get('Location') ?? '';
    const keycloakId = location.split('/').pop();
    if (!keycloakId) {
      throw new InternalServerErrorException('Keycloak did not return a user ID.');
    }

    this.logger.log(`Keycloak user created: ${keycloakId} (${email})`);
    return keycloakId;
  }

  /**
   * Send a "Set your password" invitation email via Keycloak.
   */
  async sendSetPasswordEmail(keycloakId: string): Promise<void> {
    const token = await this.getAdminToken();
    const url = `${this.authServerUrl}/admin/realms/${this.realm}/users/${keycloakId}/execute-actions-email`;

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['UPDATE_PASSWORD']),
    });

    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`Keycloak execute-actions-email failed: ${res.status} ${body}`);
      throw new InternalServerErrorException('Failed to send invitation email.');
    }
  }

  /**
   * Delete a Keycloak user.
   */
  async deleteUser(keycloakId: string): Promise<void> {
    const token = await this.getAdminToken();
    const url = `${this.authServerUrl}/admin/realms/${this.realm}/users/${keycloakId}`;

    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok && res.status !== 404) {
      this.logger.error(`Keycloak deleteUser failed: ${res.status}`);
      throw new InternalServerErrorException('Failed to delete user from Keycloak.');
    }
  }

  /**
   * Update a Keycloak user's profile fields.
   */
  async updateUser(
    keycloakId: string,
    patch: { firstName?: string; lastName?: string; email?: string },
  ): Promise<void> {
    const token = await this.getAdminToken();
    const url = `${this.authServerUrl}/admin/realms/${this.realm}/users/${keycloakId}`;

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(patch),
    });

    if (!res.ok) {
      this.logger.error(`Keycloak updateUser failed: ${res.status}`);
      throw new InternalServerErrorException('Failed to update user in Keycloak.');
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * Fetch (or return cached) admin access token via client_credentials grant.
   * Token is refreshed 10 seconds before expiry.
   */
  private async getAdminToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.tokenExpiresAt - 10_000) {
      return this.cachedToken;
    }

    const url = `${this.authServerUrl}/realms/${this.realm}/protocol/openid-connect/token`;
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Failed to get Keycloak admin token: ${res.status} ${text}`);
      throw new InternalServerErrorException('Keycloak admin authentication failed.');
    }

    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.cachedToken = data.access_token;
    this.tokenExpiresAt = Date.now() + data.expires_in * 1000;

    this.logger.log('Keycloak admin token refreshed');
    return this.cachedToken;
  }
}
