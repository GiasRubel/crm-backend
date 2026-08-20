import { BadRequestException } from '@nestjs/common';
import {
  ALLOWED_SMTP_PORTS,
  assertSmtpHostAllowed,
  assertSmtpPortAllowed,
} from './smtp-host-allowlist';

describe('assertSmtpHostAllowed', () => {
  describe('known providers', () => {
    it.each([
      'smtp.gmail.com',
      'smtp.office365.com',
      'smtp.sendgrid.net',
      'smtp.mailgun.org',
      'smtp.postmarkapp.com',
      'sandbox.smtp.mailtrap.io',
      'in-v3.mailjet.com',
    ])('accepts %s', (host) => {
      expect(() => assertSmtpHostAllowed(host)).not.toThrow();
    });

    it.each([
      ['AWS SES with a region label', 'email-smtp.eu-west-1.amazonaws.com'],
      ['a Microsoft 365 tenant relay', 'acme-com.mail.protection.outlook.com'],
    ])('accepts %s (%s)', (_label, host) => {
      expect(() => assertSmtpHostAllowed(host)).not.toThrow();
    });

    it('accepts a subdomain of an allowlisted suffix', () => {
      expect(() => assertSmtpHostAllowed('eu.smtp.mailgun.org')).not.toThrow();
    });

    it('does not let the SES pattern match a deeper attacker-controlled host', () => {
      expect(() =>
        assertSmtpHostAllowed('email-smtp.a.evil.example.amazonaws.com'),
      ).toThrow(BadRequestException);
    });

    it('is case- and trailing-dot-insensitive', () => {
      expect(() => assertSmtpHostAllowed('  SMTP.GMAIL.COM. ')).not.toThrow();
    });

    it('does not accept a lookalike that merely contains an allowlisted host', () => {
      expect(() =>
        assertSmtpHostAllowed('smtp.gmail.com.evil.example'),
      ).toThrow(BadRequestException);
    });
  });

  describe('SSRF targets', () => {
    it.each([
      ['loopback by name', 'localhost'],
      ['loopback by address', '127.0.0.1'],
      ['zero network', '0.0.0.0'],
      ['cloud metadata', '169.254.169.254'],
      ['private 10/8', '10.0.0.5'],
      ['private 192.168/16', '192.168.1.1'],
      ['private 172.16/12', '172.20.10.1'],
      ['carrier-grade NAT', '100.64.0.1'],
      ['IPv6 loopback', '::1'],
      ['IPv6 unique-local', 'fd00::1'],
      ['IPv6 link-local', 'fe80::1'],
    ])('rejects %s (%s)', (_label, host) => {
      expect(() => assertSmtpHostAllowed(host)).toThrow(BadRequestException);
    });

    it('rejects a bare internal hostname with no dot', () => {
      expect(() => assertSmtpHostAllowed('mailhog')).toThrow(
        BadRequestException,
      );
    });

    it('rejects an empty host', () => {
      expect(() => assertSmtpHostAllowed('   ')).toThrow(BadRequestException);
    });

    it('rejects an arbitrary public host that is not on the allowlist', () => {
      expect(() => assertSmtpHostAllowed('smtp.attacker.example')).toThrow(
        /not on this installation's allowlist/,
      );
    });
  });

  describe('operator allowlist', () => {
    it('accepts a host the server operator added', () => {
      expect(() =>
        assertSmtpHostAllowed('mail.acme.example', 'mail.acme.example'),
      ).not.toThrow();
    });

    it('parses a comma-separated list with surrounding whitespace', () => {
      expect(() =>
        assertSmtpHostAllowed(
          'mail.acme.example',
          ' first.example , mail.acme.example ,last.example ',
        ),
      ).not.toThrow();
    });

    it('accepts a subdomain of an operator-allowed host', () => {
      expect(() =>
        assertSmtpHostAllowed('eu.mail.acme.example', 'mail.acme.example'),
      ).not.toThrow();
    });

    it('still rejects a private address even when the operator lists it', () => {
      // The blocked-range check runs first, deliberately: an operator
      // allowlist is for reaching *their* mail server, not for re-enabling
      // internal-network probing from an org admin's settings page.
      expect(() => assertSmtpHostAllowed('10.0.0.5', '10.0.0.5')).toThrow(
        BadRequestException,
      );
    });
  });
});

describe('assertSmtpPortAllowed', () => {
  it.each([...ALLOWED_SMTP_PORTS])('accepts mail port %i', (port) => {
    expect(() => assertSmtpPortAllowed(port)).not.toThrow();
  });

  it.each([22, 80, 3306, 6379, 8080, 27017])(
    'rejects non-mail port %i',
    (port) => {
      expect(() => assertSmtpPortAllowed(port)).toThrow(BadRequestException);
    },
  );
});
