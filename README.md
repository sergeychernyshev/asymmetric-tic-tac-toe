# Asymmetric Tic-Tac-Toe

A mulitplayer asymmetric tic-tac-toe game originally developed at NY Code & Coffee hackathon by: [Sergey Chernyshev](https://github.com/sergeychernyshev), [Reid Fuhrman](https://github.com/rjfuhrman42), [Seraphim Sakiewicz](https://github.com/seraphimsakiewicz) and [Sadam Mohamed](https://github.com/sadam-m).

## Authentication Configuration

This project supports user authentication via Google, Twitch, and LinkedIn. To enable these login options, you need to configure the respective OAuth applications and set environment variables.

### Prerequisites

1.  **Session Secret**: You must set a secure random string for signing session cookies.
    ```bash
    npx wrangler secret put SESSION_SECRET
    ```

### OAuth Providers

You only need to configure the providers you wish to support.

#### 1. Google
1.  Go to the [Google Cloud Console](https://console.cloud.google.com/).
2.  Create a project and configure the **OAuth consent screen**.
3.  Create **OAuth Client ID** credentials (Web Application).
4.  Add authorized redirect URIs:
    *   Local: `http://localhost:8787/auth/google/callback`
    *   Production: `https://<your-worker>.workers.dev/auth/google/callback`
5.  Set the secrets:
    ```bash
    npx wrangler secret put GOOGLE_CLIENT_ID
    npx wrangler secret put GOOGLE_CLIENT_SECRET
    ```

#### 2. Twitch
1.  Go to the [Twitch Developer Console](https://dev.twitch.tv/console).
2.  Register your application.
3.  Add OAuth Redirect URLs:
    *   Local: `http://localhost:8787/auth/twitch/callback`
    *   Production: `https://<your-worker>.workers.dev/auth/twitch/callback`
4.  Set the secrets:
    ```bash
    npx wrangler secret put TWITCH_CLIENT_ID
    npx wrangler secret put TWITCH_CLIENT_SECRET
    ```

#### 3. LinkedIn
1.  Go to [LinkedIn Developers](https://www.linkedin.com/developers/).
2.  Create an app and add the "Sign In with LinkedIn using OpenID Connect" product.
3.  Configure Authorized Redirect URLs:
    *   Local: `http://localhost:8787/auth/linkedin/callback`
    *   Production: `https://<your-worker>.workers.dev/auth/linkedin/callback`
4.  Set the secrets:
    ```bash
    npx wrangler secret put LINKEDIN_CLIENT_ID
    npx wrangler secret put LINKEDIN_CLIENT_SECRET
    ```

### Local Development

For local development (`wrangler dev`), you might need to force the authentication origin to localhost if your worker environment reports a production URL.

Create a `.dev.vars` file in the project root:

```properties
# .dev.vars
AUTH_ORIGIN=http://localhost:8787
SESSION_SECRET=local-dev-secret
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

**Note:** `wrangler secret put` is for production secrets. For local development, use `.dev.vars`.