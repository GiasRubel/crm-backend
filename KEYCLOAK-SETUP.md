# 🚀 CRM Project: Identity & Authentication Documentation

This step-by-step guide is designed for onboarding new developers to configure **Google** and **Facebook** Social Logins via **Keycloak** and connect them with our application architecture.

---

## 🏗️ Architecture Overview

Our authentication mechanism follows enterprise security guidelines by decoupling identity from application state.

* **Identity Management (Keycloak):** Acts as the OpenID Connect (OIDC) provider. It handles logins, token generation, and user registration. The backend utilizes JWKS-based verification (RS256 Asymmetric Cryptography), meaning the NestJS backend never shares a client secret with Keycloak for normal user flows—it simply validates tokens against Keycloak's public keys.
* **Application Permissions (MongoDB):** Keycloak manages the identity (who you are), while MongoDB manages the application-level role and profile data (what you can do).
* **Just-In-Time (JIT) Provisioning:** When a user logs in via the frontend and hits the backend for the first time, the `UsersService` automatically provisions them into our MongoDB database or syncs their identity fields if they already exist.
* **Cross-Client Protection (azp validation):** The backend explicitly enforces that the `azp` (Authorized Party) claim in the incoming JWT matches our frontend client ID (`crm-frontend`), preventing cross-client token reuse attacks.

### 🔒 Implemented Security Protocols
* **Backend-for-Frontend (BFF):** The Next.js server owns the entire OIDC Authorization Code flow and holds a confidential client secret (see §1D). The browser never receives an access/refresh token — it only gets an httpOnly, encrypted session cookie. All API calls from the browser go through a same-origin proxy (`/api/backend/*`) that attaches the real bearer token server-side.
* **PKCE S256 (Proof Key for Code Exchange):** Still used defensively during the server-side code exchange even though the client is confidential.
* **Server-side session gating:** `crm-frontend/src/proxy.ts` (Next.js 16's successor to `middleware.ts`) resolves the session cookie — and silently refreshes the access token via the refresh token — before a protected page ever renders. This replaces the old client-side `check-sso` iframe bounce: no client round-trip is needed to know if the user is logged in.
* **Global Security Guard:** Every route is locked by default using a global guard. Public endpoints must explicitly declare the `@Public()` decorator.

---

## Part 1 — Keycloak Admin Configuration

Open your browser and navigate to the Keycloak Admin Console at `http://localhost:18080`. Log in and select the realm named **`crm-realm`**.

### 1A — Create Frontend Client (`crm-frontend`)
1. Click on **Clients** from the left-hand navigation menu.
2. Click the **Create client** button.
3. Set **Client ID** to `crm-frontend` and click **Next**.
4. In the **Capability config** step, ensure **Standard Flow** is checked.
5. Ensure **Client Authentication** is toggled **Off** (This makes it a Public Client). Click **Next**.
6. Under **Login settings**, set **Valid redirect URIs** to `http://localhost:3001/*`.
7. Set **Web origins** to `http://localhost:3001`.
8. Scroll down to the bottom of the page and click **Save**.

> As of the BFF migration (see §1D below), this client must be reconfigured as
> **confidential** — the steps above describe the legacy public/PKCE-only setup.
> Follow 1D instead for new environments.

### 1D — Convert `crm-frontend` to a Confidential Client (BFF)

The frontend no longer runs OIDC in the browser — the Next.js server now owns
the Authorization Code flow and can safely hold a client secret. `crm-frontend`
must be switched from a public (PKCE-only) client to a confidential one:

1. Open **Clients** → `crm-frontend`.
2. Toggle **Client Authentication** to **On** (this makes it a Confidential
   Client, mirroring `crm-backend-service` in 1B).
3. Under **Login settings**, update **Valid redirect URIs** to include
   `http://localhost:3001/api/auth/callback` (the new server-side callback route
   — the old catch-all `http://localhost:3001/*` can be narrowed to just this).
4. Add `http://localhost:3001` to **Valid post logout redirect URIs** (used by
   RP-initiated logout after `GET /api/auth/logout`). **Match this exactly**
   against `APP_BASE_URL` — Keycloak compares post-logout URIs literally, so a
   configured `http://localhost:3001` rejects a sent `http://localhost:3001/`
   with "Invalid redirect uri". The logout route strips the trailing slash for
   this reason; if you prefer, `http://localhost:3001/*` matches either form.
5. Click **Save**, then open the newly visible **Credentials** tab and copy the
   **Client Secret** — this becomes `KEYCLOAK_CLIENT_SECRET` in
   `crm-frontend/.env.local`.
6. **Standard Flow** must remain checked; **Direct Access Grants** can stay off.
   PKCE is still used defensively even though the client is now confidential.

### 1B — Create Admin Service Client (`crm-backend-service`)
1. Click on **Clients** from the left-hand navigation menu.
2. Click the **Create client** button.
3. Set **Client ID** to `crm-backend-service` and click **Next**.
4. In the **Capability config** step, toggle **Client Authentication** to **On** (This makes it a Confidential Client).
5. Check the **Service accounts roles** checkbox. Click **Save**.
6. Navigate to the newly visible **Credentials** tab at the top.
7. Copy the **Client Secret** value. This will be used as `KEYCLOAK_ADMIN_CLIENT_SECRET` in the backend configuration.
8. **Grant the service account user-management roles** (without this, every admin API
   call returns 403 and customer creation fails with "Failed to create user in Keycloak."):
   1. Open the **Service accounts roles** tab of the `crm-backend-service` client.
   2. Click **Assign role**, then switch the filter to **Filter by clients**.
   3. Assign the `realm-management` roles: **manage-users**, **view-users**, and **query-users**.

### 1C — Add Protocol Mapper for Identity Provider Claim
1. Click on **Clients** from the left-hand navigation menu.
2. Click on your frontend client: **`crm-frontend`**.
3. Select the **Client scopes** tab from the top bar.
4. Click on the dedicated scope link named **`crm-frontend-dedicated`** (the one with Type: *Dedicated*).
5. Click on the **Mappers** tab from the top bar.
6. Click the **Configure a new mapper** button (or **Add mapper** -> **By configuration**).
7. Select **User Session Note** from the list of available mapper types.
8. Fill in the configuration fields exactly as specified below:
   * **Name**: `identity-provider-claim`
   * **User Session Note**: `identity_provider`
   * **Token Claim Name**: `identity_provider`
   * **Claim JSON Type**: `String`
   * **Add to ID token**: Toggle **On**
   * **Add to access token**: Toggle **On**
9. Click the **Save** button.

---

## Part 2 — Google & Facebook Identity Providers Setup

### 2A — Configure Google Identity Provider
1. Log in to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project or select your existing CRM project.
3. Configure the OAuth Consent Screen if you haven't already.
4. Navigate to **APIs & Services** -> **Credentials**.
5. Click **Create Credentials** and select **OAuth 2.0 Client ID**.
6. Set the Application Type to **Web application**.
7. Under **Authorized redirect URIs**, add the following exact URL:
   `http://localhost:18080/realms/crm-realm/broker/google/endpoint`
8. Click **Create** and copy both the **Client ID** and **Client Secret**.
9. Return to the Keycloak Admin Console.
10. Click **Identity providers** from the left menu.
11. Click **Add provider** and choose **Google** from the dropdown.
12. Paste the copied Google **Client ID** and **Client Secret** into their respective fields.
13. Set **Default Scopes** to: `openid email profile`
14. Scroll down and click **Save**.

### 2B — Configure Facebook Identity Provider
1. Log in to the [Meta for Developers](https://developers.facebook.com/) portal.
2. Create a new app and choose the appropriate use-case (Consumer or Business).
3. Navigate to **App settings** -> **Basic** from the left menu.
4. Add a placeholder URL in the **Privacy Policy URL** field (e.g., `http://localhost:3001/privacy`).
5. Click **Save changes**.
6. Go to **Use Cases** or add the **Facebook Login** product to your app.
7. Locate the **Valid OAuth Redirect URIs** configuration box.
8. **MANUALLY TYPE** the following URL into the input field and press **Enter** (Do not copy-paste to prevent trailing spaces or hidden characters):
   `http://localhost:18080/realms/crm-realm/broker/facebook/endpoint`
9. Verify that **NO RED CROSS SYMBOL (❌)** appears underneath the input box after pressing Enter.
10. Click **Save changes** at the bottom of the Meta panel.
11. Return to the Keycloak Admin Console.
12. Click **Identity providers** from the left menu.
13. Click **Add provider**, select the **Social** sub-category, and click **Facebook**.
14. Copy the **App ID** and **App Secret** from the Meta dashboard and paste them into Keycloak's **Client ID** and **Client Secret** fields.
15. Scroll down to expand the **Advanced settings** section inside Keycloak.
16. Find the input field explicitly named **Scopes**.
17. Type **`public_profile`** into the box and press **Enter** to turn it into a tag chip (Leave the field empty of `email` if your Meta app is in Development Mode to bypass verification issues).
18. Click **Save**.

### 2C — Configure First Login Flow (Bypass Account Review)
1. Click on **Authentication** from Keycloak's left-hand navigation menu.
2. Select the **Flows** tab from the main dashboard area.
3. Click on the flow named **First broker login** to expand its nested execution steps.
4. Locate the row corresponding to the **Review profile** requirement.
5. Click the three dots icon `(...)` on the far right side of the *Review profile* row.
6. Select **Disabled** from the available options (This prevents the application flow from interrupting the user with a mandatory profile review screen during their first social registration).
7. Ensure that the row for **Create user if unique** is left set to **Required**.

---

## Part 3 — Environment Configurations

Ensure the following environment variables are created and populated within your respective project environments.

### 3A — NestJS Backend Configurations (`crm-backend/.env`)
```env
PORT=5000
MONGO_URI=mongodb://root:root_password@localhost:27018/crm_prod?authSource=admin
FRONTEND_URL=http://localhost:3001

KEYCLOAK_AUTH_SERVER_URL=http://localhost:18080
KEYCLOAK_REALM=crm-realm
KEYCLOAK_CLIENT_ID=crm-frontend

MAIL_HOST=smtp.mailtrap.io
MAIL_PORT=587
MAIL_USER=764c576d92b896
MAIL_PASS=0b3163b9155961
MAIL_FROM_ADDRESS=ekpay@example.com
MAIL_FROM_NAME=CRM Pro

KEYCLOAK_ADMIN_CLIENT_ID=crm-backend-service
KEYCLOAK_ADMIN_CLIENT_SECRET=DmmalMglvoq4MNMPd79fbOBYfKepP8j2
```

### 3B — NextJS Frontend Configurations (`crm-frontend/.env.local`)

Since the BFF migration, the frontend no longer talks to Keycloak from the
browser — these are all server-only vars (no `NEXT_PUBLIC_` prefix):

```env
PORT=3001

APP_BASE_URL=http://localhost:3001
BACKEND_INTERNAL_URL=http://localhost:5000

KEYCLOAK_ISSUER=http://localhost:18080/realms/crm-realm
KEYCLOAK_REALM=crm-realm
KEYCLOAK_CLIENT_ID=crm-frontend
KEYCLOAK_CLIENT_SECRET=<from crm-frontend client's Credentials tab, see 1D>

SESSION_SECRET=<openssl rand -hex 32>
```

---

## Part 4 — How the BFF Login Flow Works

End-to-end, for a user hitting a protected page while logged out:

1. `proxy.ts` finds no session cookie → redirects to
   `GET /api/auth/login?returnTo=/dashboard`.
2. **`/api/auth/login`** generates a PKCE `code_verifier` + `state`, seals both
   (plus `returnTo`) into a short-lived `crm_oauth_flow` cookie, and redirects
   to Keycloak's authorization endpoint. `?idpHint=google|facebook` skips
   straight to a social provider; `?register=true` targets Keycloak's
   registration form instead of its login form.
3. The user authenticates at Keycloak, which redirects back to
   **`/api/auth/callback?code=…&state=…`**.
4. The callback exchanges the code for tokens **server-side** (confidential
   client secret + PKCE verifier), then seals `{ accessToken, refreshToken,
   expiresAt }` into the httpOnly `crm_session` cookie and redirects to
   `returnTo`. The browser is never given a token.
5. On subsequent requests, `proxy.ts` unseals the cookie; if the access token is
   within 30s of expiry it runs a refresh-token grant and re-seals the cookie
   transparently.
6. Browser API calls go to same-origin `/api/backend/*`, which reads the cookie
   server-side, attaches `Authorization: Bearer <access_token>`, and forwards to
   this NestJS API — whose `JwtStrategy` validates it exactly as before.
7. **`/api/auth/logout`** clears the cookies and redirects to Keycloak's
   end-session endpoint with `id_token_hint`, ending the SSO session too.

### Session cookie mechanics (two non-obvious constraints)

* **The session cookie is chunked** across `crm_session.0`, `crm_session.1`, …
  Browsers silently discard any single cookie larger than ~4 KB — no error is
  raised anywhere — and a sealed Keycloak access+refresh token pair lands right
  at that boundary. Writing it as one cookie makes the browser drop it, which
  the app reads as "logged out" and turns into an infinite login redirect loop.
  Always go through the helpers in `crm-frontend/src/lib/auth/session.ts`.
* **The `id_token` lives in its own cookie** (`crm_id_token.*`), scoped to
  `path=/api/auth/logout` so its ~1.7 KB is not re-sent on every API request.
  It is required: without `id_token_hint`, Keycloak cannot identify the session
  being ended and interrupts logout with a "Do you want to log out?"
  confirmation page.