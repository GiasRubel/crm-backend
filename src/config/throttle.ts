import { Throttle } from '@nestjs/throttler';

/**
 * Named rate-limit buckets.
 *
 * `default` is the module-wide ceiling, meant only to blunt scripted abuse of the
 * authenticated API. The other entries are per-route tightenings, applied with
 * the decorators below — every unauthenticated endpoint gets one, because for
 * those the request itself is the cost: an OTP email, a database write, a
 * password guess, or a call out to a third-party API.
 *
 * Each decorator overrides the `default` throttler rather than registering an
 * extra named one. That is deliberate: @nestjs/throttler only honours an
 * override whose key matches a throttler declared in `ThrottlerModule.forRoot`,
 * and declaring `login` there would apply the 5/min limit to *every* route, not
 * just the login. Overriding `default` per route gives one active limit per
 * route — the tighter one where a route asks for it.
 */
export const THROTTLE_BUCKETS = {
  default: { ttl: 60_000, limit: 300 },
  /** Password guessing. Slow enough that online brute force is hopeless. */
  login: { ttl: 60_000, limit: 5 },
  /** Each request sends real email to an address the caller chose. */
  otp: { ttl: 300_000, limit: 3 },
  /** Anonymous writes to the leads collection. */
  capture: { ttl: 60_000, limit: 10 },
  /** Licence-code guessing, and calls out to a third-party API. */
  activate: { ttl: 3_600_000, limit: 10 },
} as const;

/** `@ThrottleLogin()` — credential-checking endpoints. */
export const ThrottleLogin = () =>
  Throttle({ default: THROTTLE_BUCKETS.login });

/** `@ThrottleOtp()` — endpoints that send mail to a caller-supplied address. */
export const ThrottleOtp = () => Throttle({ default: THROTTLE_BUCKETS.otp });

/** `@ThrottleCapture()` — anonymous record creation. */
export const ThrottleCapture = () =>
  Throttle({ default: THROTTLE_BUCKETS.capture });

/** `@ThrottleActivate()` — licence activation. */
export const ThrottleActivate = () =>
  Throttle({ default: THROTTLE_BUCKETS.activate });
