// Loaded via jest-e2e.json "setupFiles" — runs before any spec file (and
// therefore before AppModule's `ConfigModule.forRoot()`, which reads these
// at import time) is required. Values set here win over `.env` because
// dotenv never overwrites a variable already present in `process.env`.
process.env.NODE_ENV = 'test';
process.env.MONGO_URI =
  'mongodb://root:root_password@localhost:27018/crm_backend_e2e_test?authSource=admin';
process.env.KEYCLOAK_AUTH_SERVER_URL = 'http://localhost:8080/auth';
process.env.KEYCLOAK_REALM = 'crm-e2e-test';
process.env.KEYCLOAK_CLIENT_ID = 'crm-frontend-e2e-test';
process.env.KEYCLOAK_ADMIN_CLIENT_ID = 'crm-backend-service-e2e-test';
process.env.KEYCLOAK_ADMIN_CLIENT_SECRET = 'e2e-test-secret';
// Required by src/config/env-validation.ts, which now aborts boot without it.
process.env.FRONTEND_URL = 'http://localhost:3001';
// Real 32+ char secrets so the placeholder check stays quiet in test output.
process.env.LOCAL_JWT_ACCESS_SECRET =
  'e2e-test-local-jwt-access-secret-0123456789';
process.env.LOCAL_JWT_REFRESH_SECRET =
  'e2e-test-local-jwt-refresh-secret-0123456789';
process.env.MAIL_SETTINGS_ENCRYPTION_KEY =
  'e2e-test-mail-settings-encryption-key-0123';
process.env.CALENDAR_TOKEN_ENCRYPTION_KEY =
  'e2e-test-calendar-token-encryption-key-012';
// Only honoured when NODE_ENV==='test' — see AppModule's ThrottlerModule.skipIf.
process.env.THROTTLE_DISABLED = 'true';
