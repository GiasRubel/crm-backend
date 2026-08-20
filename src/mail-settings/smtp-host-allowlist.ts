import { BadRequestException } from '@nestjs/common';

/**
 * Which SMTP hosts an organisation admin may point their mail settings at.
 *
 * Without this, "SMTP host" is an arbitrary attacker-controlled outbound TCP
 * destination: an org admin could set `host` to `169.254.169.254`,
 * `localhost:6379`, or an internal service address and use the "send test email"
 * button as an SSRF probe — reading connect/timeout/error differences to map the
 * network the CRM sits inside, from a role that is *not* meant to confer server
 * access.
 *
 * Two layers, both required:
 *  1. The host must resolve to a public address shape (no loopback, no private
 *     ranges, no link-local, no bare hostnames without a dot).
 *  2. The host must match a known mail provider, or an entry the *server
 *     operator* added via MAIL_SMTP_HOST_ALLOWLIST. An org admin cannot extend
 *     the list; only whoever controls the deployment can.
 */

/** Common transactional-email providers, matched as exact hosts or subdomains. */
const BUILT_IN_SUFFIXES: readonly string[] = [
  'smtp.gmail.com',
  'smtp-relay.gmail.com',
  'smtp.googlemail.com',
  'smtp.office365.com',
  'smtp-mail.outlook.com',
  'smtp.sendgrid.net',
  'smtp.mailgun.org',
  'smtp.postmarkapp.com',
  'smtp.sparkpostmail.com',
  'smtp.mailtrap.io',
  'live.smtp.mailtrap.io',
  'sandbox.smtp.mailtrap.io',
  'smtp.resend.com',
  'smtp.zoho.com',
  'smtp.zoho.eu',
  'smtp.fastmail.com',
  'smtp.mail.yahoo.com',
  'smtp.yandex.com',
  'in-v3.mailjet.com',
  'smtp.brevo.com',
  'smtp-relay.brevo.com',
  'smtp.elasticemail.com',
];

/**
 * Providers whose hostname varies in the middle rather than as a subdomain, so a
 * suffix match cannot express them. Anchored, and the variable part is
 * restricted to a region-label shape — not `.*`, which would readmit anything.
 */
const BUILT_IN_PATTERNS: readonly RegExp[] = [
  // AWS SES, e.g. email-smtp.eu-west-1.amazonaws.com
  /^email-smtp\.[a-z0-9-]{1,32}\.amazonaws\.com$/,
  // Microsoft 365 tenant relay, e.g. acme-com.mail.protection.outlook.com
  /^[a-z0-9-]{1,63}\.mail\.protection\.outlook\.com$/,
];

/** Ports a mail submission service plausibly listens on. */
export const ALLOWED_SMTP_PORTS: readonly number[] = [25, 465, 587, 2525];

/** Literal addresses and ranges that must never be dialled. */
const BLOCKED_PATTERNS: readonly RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./, // link-local, incl. cloud metadata at 169.254.169.254
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // carrier-grade NAT
  /^::1$/,
  /^\[?::1\]?$/,
  /^f[cd][0-9a-f]{2}:/i, // IPv6 unique-local
  /^fe80:/i, // IPv6 link-local
];

function parseOperatorAllowlist(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function matchesSuffix(host: string, suffixes: readonly string[]): boolean {
  return suffixes.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

/**
 * @param host the host an org admin submitted
 * @param operatorAllowlistRaw the raw MAIL_SMTP_HOST_ALLOWLIST value
 * @throws BadRequestException when the host is not permitted
 */
export function assertSmtpHostAllowed(
  host: string,
  operatorAllowlistRaw?: string,
): void {
  const normalized = host.trim().toLowerCase().replace(/\.$/, '');

  if (!normalized) {
    throw new BadRequestException('SMTP host is required');
  }

  if (BLOCKED_PATTERNS.some((pattern) => pattern.test(normalized))) {
    throw new BadRequestException(
      "That SMTP host is not permitted. Use your mail provider's public SMTP hostname.",
    );
  }

  // A bare label with no dot can only be an internal hostname or a container
  // name — never a real public mail server.
  if (!normalized.includes('.')) {
    throw new BadRequestException(
      'Enter a fully-qualified SMTP hostname, e.g. smtp.example.com',
    );
  }

  const operatorAllowed = parseOperatorAllowlist(operatorAllowlistRaw);
  if (
    matchesSuffix(normalized, BUILT_IN_SUFFIXES) ||
    BUILT_IN_PATTERNS.some((pattern) => pattern.test(normalized)) ||
    matchesSuffix(normalized, operatorAllowed)
  ) {
    return;
  }

  throw new BadRequestException(
    `SMTP host "${host}" is not on this installation's allowlist. ` +
      'Ask your server administrator to add it to MAIL_SMTP_HOST_ALLOWLIST.',
  );
}

/** @throws BadRequestException when the port is not a mail submission port */
export function assertSmtpPortAllowed(port: number): void {
  if (!ALLOWED_SMTP_PORTS.includes(port)) {
    throw new BadRequestException(
      `SMTP port must be one of ${ALLOWED_SMTP_PORTS.join(', ')}`,
    );
  }
}
