/**
 * Boot-time environment validation.
 *
 * Two jobs, both of which used to fail silently and surface much later as a
 * runtime error or — worse — as a security hole:
 *
 *  1. Required variables must be present. A missing `MONGO_URI` previously got
 *     as far as accepting requests before Mongoose gave up.
 *  2. The shipped dev placeholders must never survive into a real deployment.
 *     Every copy of this product ships with the same `dev-…-change-me` signing
 *     secret, so a deployment that keeps it has forgeable sessions and
 *     cross-installation-decryptable secrets.
 *
 * Runs through `ConfigModule.forRoot({ validate })`, so a failure aborts the
 * process before anything binds a port.
 */

/** Variables without which the app cannot function in any mode. */
const REQUIRED = ['MONGO_URI', 'FRONTEND_URL'] as const;

/**
 * Secrets whose shipped placeholder value is a security defect once deployed.
 * Any value containing `change-me` counts as unset, not just the exact default —
 * a buyer who edits half of the placeholder has still not chosen a secret.
 */
const SECRETS = [
  'LOCAL_JWT_ACCESS_SECRET',
  'LOCAL_JWT_REFRESH_SECRET',
  'MAIL_SETTINGS_ENCRYPTION_KEY',
  'CALENDAR_TOKEN_ENCRYPTION_KEY',
] as const;

/** Minimum entropy we insist on for a hand-generated secret. */
const MIN_SECRET_LENGTH = 32;

const PLACEHOLDER = /change[-_ ]?me|^changeme$|your[-_ ]?secret[-_ ]?here/i;

export function isPlaceholderSecret(value: string | undefined): boolean {
  if (!value) return true;
  return PLACEHOLDER.test(value) || value.trim().length < MIN_SECRET_LENGTH;
}

/**
 * @param env raw `process.env`-shaped record
 * @returns the same record, so it can be used directly as ConfigModule's
 *   `validate` hook
 */
export function validateEnv(
  env: Record<string, unknown>,
): Record<string, unknown> {
  const errors: string[] = [];
  const read = (key: string): string | undefined => {
    const raw = env[key];
    return typeof raw === 'string' && raw.trim() !== '' ? raw : undefined;
  };

  for (const key of REQUIRED) {
    if (!read(key)) errors.push(`${key} is required but not set`);
  }

  const mode = read('DEPLOYMENT_MODE') ?? 'standalone';
  if (mode !== 'standalone' && mode !== 'saas') {
    errors.push(
      `DEPLOYMENT_MODE must be "standalone" or "saas" (got "${mode}")`,
    );
  }

  const port = read('PORT');
  if (port !== undefined && !/^\d+$/.test(port)) {
    errors.push(`PORT must be a number (got "${port}")`);
  }

  // Placeholder secrets are tolerated in development so a fresh clone runs, but
  // never in production — that is the whole point of the check.
  const isProduction = read('NODE_ENV') === 'production';
  for (const key of SECRETS) {
    const value = read(key);
    if (!isPlaceholderSecret(value)) continue;
    const detail = value
      ? 'is still the shipped placeholder or is shorter than 32 characters'
      : 'is not set';
    if (isProduction) {
      errors.push(
        `${key} ${detail}. Generate one with \`openssl rand -hex 32\` — ` +
          'leaving the default makes sessions forgeable across every ' +
          'installation of this product.',
      );
    } else {
      console.warn(
        `[env] WARNING: ${key} ${detail}. This is fatal when NODE_ENV=production.`,
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n  - ${errors.join('\n  - ')}\n` +
        'See crm-backend/.env.example for the full list of variables.',
    );
  }

  return env;
}
