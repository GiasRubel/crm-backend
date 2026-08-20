import { isPlaceholderSecret, validateEnv } from './env-validation';

const REAL_SECRET = 'a'.repeat(64);

/** A minimally valid environment, so each test can vary exactly one thing. */
function baseEnv(overrides: Record<string, unknown> = {}) {
  return {
    MONGO_URI: 'mongodb://localhost:27017/crm',
    FRONTEND_URL: 'http://localhost:3001',
    LOCAL_JWT_ACCESS_SECRET: REAL_SECRET,
    LOCAL_JWT_REFRESH_SECRET: REAL_SECRET,
    MAIL_SETTINGS_ENCRYPTION_KEY: REAL_SECRET,
    CALENDAR_TOKEN_ENCRYPTION_KEY: REAL_SECRET,
    ...overrides,
  };
}

describe('isPlaceholderSecret', () => {
  it.each([
    [undefined, true],
    ['', true],
    ['dev-local-jwt-access-secret-change-me', true],
    ['CHANGE_ME', true],
    ['changeme', true],
    ['your-secret-here', true],
    ['short', true],
    ['a'.repeat(31), true],
    ['a'.repeat(32), false],
    [REAL_SECRET, false],
  ])('treats %p as placeholder=%p', (value, expected) => {
    expect(isPlaceholderSecret(value as string | undefined)).toBe(expected);
  });
});

describe('validateEnv', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => warn.mockRestore());

  it('returns the env unchanged when everything is valid', () => {
    const env = baseEnv();
    expect(validateEnv(env)).toBe(env);
  });

  it.each(['MONGO_URI', 'FRONTEND_URL'])('rejects a missing %s', (key) => {
    expect(() => validateEnv(baseEnv({ [key]: undefined }))).toThrow(key);
  });

  it('treats a whitespace-only required value as missing', () => {
    expect(() => validateEnv(baseEnv({ MONGO_URI: '   ' }))).toThrow(
      'MONGO_URI',
    );
  });

  it('rejects an unrecognised DEPLOYMENT_MODE', () => {
    expect(() =>
      validateEnv(baseEnv({ DEPLOYMENT_MODE: 'enterprise' })),
    ).toThrow('DEPLOYMENT_MODE');
  });

  it.each(['standalone', 'saas'])('accepts DEPLOYMENT_MODE=%s', (mode) => {
    expect(() => validateEnv(baseEnv({ DEPLOYMENT_MODE: mode }))).not.toThrow();
  });

  it('rejects a non-numeric PORT', () => {
    expect(() => validateEnv(baseEnv({ PORT: '5000abc' }))).toThrow('PORT');
  });

  describe('shipped placeholder secrets', () => {
    const PLACEHOLDERS = [
      'LOCAL_JWT_ACCESS_SECRET',
      'LOCAL_JWT_REFRESH_SECRET',
      'MAIL_SETTINGS_ENCRYPTION_KEY',
      'CALENDAR_TOKEN_ENCRYPTION_KEY',
    ];

    it.each(PLACEHOLDERS)(
      'refuses to boot in production while %s is a placeholder',
      (key) => {
        expect(() =>
          validateEnv(
            baseEnv({ NODE_ENV: 'production', [key]: 'dev-thing-change-me' }),
          ),
        ).toThrow(key);
      },
    );

    it.each(PLACEHOLDERS)(
      'refuses to boot in production while %s is unset',
      (key) => {
        expect(() =>
          validateEnv(baseEnv({ NODE_ENV: 'production', [key]: undefined })),
        ).toThrow(key);
      },
    );

    it('names every offending secret in one error, not just the first', () => {
      expect(() =>
        validateEnv(
          baseEnv({
            NODE_ENV: 'production',
            LOCAL_JWT_ACCESS_SECRET: 'change-me',
            MAIL_SETTINGS_ENCRYPTION_KEY: 'change-me',
          }),
        ),
      ).toThrow(/LOCAL_JWT_ACCESS_SECRET[\s\S]*MAIL_SETTINGS_ENCRYPTION_KEY/);
    });

    it('warns but boots outside production, so a fresh clone still runs', () => {
      expect(() =>
        validateEnv(
          baseEnv({
            NODE_ENV: 'development',
            LOCAL_JWT_ACCESS_SECRET: 'dev-secret-change-me',
          }),
        ),
      ).not.toThrow();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('LOCAL_JWT_ACCESS_SECRET'),
      );
    });
  });
});
