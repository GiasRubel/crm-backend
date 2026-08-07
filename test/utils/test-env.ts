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
