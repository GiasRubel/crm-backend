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
* **PKCE S256 (Proof Key for Code Exchange):** Implemented on the frontend to protect Authorization Code Grants against interception attacks in public clients (SPAs).
* **check-sso (Silent SSO):** Enabled on the frontend for seamless background session checks without jarring screen redirects.
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

### 1B — Create Admin Service Client (`crm-backend-service`)
1. Click on **Clients** from the left-hand navigation menu.
2. Click the **Create client** button.
3. Set **Client ID** to `crm-backend-service` and click **Next**.
4. In the **Capability config** step, toggle **Client Authentication** to **On** (This makes it a Confidential Client).
5. Check the **Service accounts roles** checkbox. Click **Save**.
6. Navigate to the newly visible **Credentials** tab at the top.
7. Copy the **Client Secret** value. This will be used as `KEYCLOAK_ADMIN_CLIENT_SECRET` in the backend configuration.

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
```env

PORT=3001
NEXT_PUBLIC_API_BASE_URL=http://localhost:5000

NEXT_PUBLIC_KEYCLOAK_URL=http://localhost:18080
NEXT_PUBLIC_KEYCLOAK_REALM=crm-realm
NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=crm-frontend
```