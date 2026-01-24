import { z } from 'zod';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  provider: string;
}

interface AuthProvider {
  name: string;
  getAuthUrl(env: Env, state: string, origin: string): string;
  getUser(env: Env, code: string, origin: string): Promise<UserProfile>;
}

const GoogleUserSchema = z.object({
  sub: z.string(),
  name: z.string(),
  email: z.string(),
  picture: z.string().optional(),
});

const TwitchUserSchema = z.object({
  id: z.string(),
  login: z.string(),
  display_name: z.string(),
  email: z.string().optional(),
});

const LinkedInUserSchema = z.object({
  sub: z.string(),
  name: z.string(),
  email: z.string().optional(),
  picture: z.string().optional(),
});


export const GoogleProvider: AuthProvider = {
  name: 'google',
  getAuthUrl(env: Env, state: string, origin: string) {
    if (!env.GOOGLE_CLIENT_ID) throw new Error('GOOGLE_CLIENT_ID not set');
    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: `${origin}/auth/google/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'offline', // optional, for refresh token
      prompt: 'consent', // optional
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  },
  async getUser(env: Env, code: string, origin: string): Promise<UserProfile> {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw new Error('Google env vars not set');

    const redirect_uri = `${origin}/auth/google/callback`;
    console.log(`[Google Auth] Exchanging code for token. Redirect URI: ${redirect_uri}`);

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri,
        grant_type: 'authorization_code',
      }).toString(),
    });

    if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('Google token error:', errorText);
        throw new Error(`Failed to exchange code: ${tokenResponse.statusText}`);
    }

    const tokenData = await tokenResponse.json() as { access_token: string, id_token: string };
    
    // We can use id_token or fetch userinfo. Fetching userinfo is safer/easier if we don't want to validate JWT signature locally (though we should).
    // For simplicity in this worker, we'll hit the userinfo endpoint.
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    
    if (!userResponse.ok) throw new Error('Failed to fetch user info');

    const userData = GoogleUserSchema.parse(await userResponse.json());

    return {
      id: userData.sub,
      email: userData.email,
      name: userData.name,
      provider: 'google',
    };
  },
};

export const TwitchProvider: AuthProvider = {
  name: 'twitch',
  getAuthUrl(env: Env, state: string, origin: string) {
    if (!env.TWITCH_CLIENT_ID) throw new Error('TWITCH_CLIENT_ID not set');
    const params = new URLSearchParams({
      client_id: env.TWITCH_CLIENT_ID,
      redirect_uri: `${origin}/auth/twitch/callback`,
      response_type: 'code',
      scope: 'user:read:email',
      state,
    });
    return `https://id.twitch.tv/oauth2/authorize?${params.toString()}`;
  },
  async getUser(env: Env, code: string, origin: string): Promise<UserProfile> {
    if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) throw new Error('Twitch env vars not set');
    
    const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.TWITCH_CLIENT_ID,
        client_secret: env.TWITCH_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${origin}/auth/twitch/callback`,
      }),
    });

    if (!tokenResponse.ok) throw new Error('Failed to exchange code');
    const tokenData = await tokenResponse.json() as { access_token: string };

    const userResponse = await fetch('https://api.twitch.tv/helix/users', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Client-Id': env.TWITCH_CLIENT_ID,
      },
    });

    if (!userResponse.ok) throw new Error('Failed to fetch user info');
    
    const data = await userResponse.json() as { data: any[] };
    if (!data.data || data.data.length === 0) throw new Error('No user data found');
    
    const userData = TwitchUserSchema.parse(data.data[0]);

    return {
      id: userData.id,
      email: userData.email || '', // Email might be optional depending on scope/verification
      name: userData.display_name,
      provider: 'twitch',
    };
  },
};

export const LinkedInProvider: AuthProvider = {
  name: 'linkedin',
  getAuthUrl(env: Env, state: string, origin: string) {
    if (!env.LINKEDIN_CLIENT_ID) throw new Error('LINKEDIN_CLIENT_ID not set');
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: env.LINKEDIN_CLIENT_ID,
      redirect_uri: `${origin}/auth/linkedin/callback`,
      state,
      scope: 'openid profile email',
    });
    return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
  },
  async getUser(env: Env, code: string, origin: string): Promise<UserProfile> {
    if (!env.LINKEDIN_CLIENT_ID || !env.LINKEDIN_CLIENT_SECRET) throw new Error('LinkedIn env vars not set');

    const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            client_id: env.LINKEDIN_CLIENT_ID,
            client_secret: env.LINKEDIN_CLIENT_SECRET,
            redirect_uri: `${origin}/auth/linkedin/callback`,
        }),
    });

    if (!tokenResponse.ok) throw new Error('Failed to exchange code');
    const tokenData = await tokenResponse.json() as { access_token: string };

    const userResponse = await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userResponse.ok) throw new Error('Failed to fetch user info');

    const userData = LinkedInUserSchema.parse(await userResponse.json());

    return {
        id: userData.sub,
        email: userData.email,
        name: userData.name,
        provider: 'linkedin',
    };
  },
};


const providers: Record<string, AuthProvider> = {
  google: GoogleProvider,
  twitch: TwitchProvider,
  linkedin: LinkedInProvider,
};

export async function handleAuth(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(p => p);
  
  const isAnyProviderConfigured = !!(env.GOOGLE_CLIENT_ID || env.TWITCH_CLIENT_ID || env.LINKEDIN_CLIENT_ID);

  if (isAnyProviderConfigured && (!env.SESSION_SECRET || env.SESSION_SECRET === 'replace-with-secure-random-string' || env.SESSION_SECRET.trim() === '')) {
    return new Response('Configuration Error: SESSION_SECRET is not configured. Please set it using `wrangler secret put SESSION_SECRET`.', { status: 500 });
  }

  if (pathParts[0] !== 'auth' || pathParts.length < 2) return new Response('Not Found', { status: 404 });

  if (pathParts[1] === 'logout') {
    return new Response(null, {
        status: 302,
        headers: {
            Location: '/',
            'Set-Cookie': 'session=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0',
        },
    });
  }

  const providerName = pathParts[1];
  const provider = providers[providerName];

  if (!provider) return new Response('Provider not supported', { status: 404 });

  const isCallback = pathParts[2] === 'callback';

  // Use configured origin or fallback to request origin
  // Cloudflare Workers often have correct request.url, but sometimes behind proxies or in dev it might differ.
  // We can add an optional env var AUTH_ORIGIN to force it.
  const origin = (env as any).AUTH_ORIGIN || url.origin;
  console.log(`[Auth] Using origin: ${origin} (Request URL: ${request.url})`);

  if (!isCallback) {
    // Phase 1: Redirect to provider
    const state = crypto.randomUUID();
    const authUrl = provider.getAuthUrl(env, state, origin);
    
    return new Response(null, {
      status: 302,
      headers: {
        Location: authUrl,
        'Set-Cookie': `auth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=300; Secure`,
      },
    });
  } else {
    // Phase 2: Callback
    const cookieHeader = request.headers.get('Cookie');
    const cookies = parseCookies(cookieHeader);
    const storedState = cookies['auth_state'];
    const queryState = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (error) return new Response(`Auth Error: ${error}`, { status: 400 });
    if (!code) return new Response('No code provided', { status: 400 });
    if (!storedState || !queryState || storedState !== queryState) {
      return new Response('Invalid state', { status: 400 });
    }

    try {
      const user = await provider.getUser(env, code, origin);
      
      // Create session
      const sessionData = JSON.stringify(user);
      const signature = await sign(sessionData, env.SESSION_SECRET);
      const sessionValue = btoa(sessionData) + '.' + btoa(signature);

      const headers = new Headers();
      headers.set('Location', '/');
      headers.append('Set-Cookie', `auth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
      headers.append('Set-Cookie', `session=${sessionValue}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=2592000`);

      return new Response(null, {
        status: 302,
        headers,
      });

    } catch (e: any) {
      return new Response(`Auth Failed: ${e.message}`, { status: 500 });
    }
  }
}

// Cookie Helpers
function parseCookies(header: string | null): Record<string, string> {
  const list: Record<string, string> = {};
  if (!header) return list;
  header.split(';').forEach(cookie => {
    let [name, ...rest] = cookie.split('=');
    name = name?.trim();
    if (!name) return;
    const value = rest.join('=').trim();
    list[name] = decodeURIComponent(value);
  });
  return list;
}

// Crypto Helpers
async function sign(data: string, secret: string): Promise<string> {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw', 
        enc.encode(secret), 
        { name: 'HMAC', hash: 'SHA-256' }, 
        false, 
        ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, enc.encode(data));
    return String.fromCharCode(...new Uint8Array(signature));
}

export async function verifySession(request: Request, env: Env): Promise<UserProfile | null> {
    const isAnyProviderConfigured = !!(env.GOOGLE_CLIENT_ID || env.TWITCH_CLIENT_ID || env.LINKEDIN_CLIENT_ID);
    
    if (isAnyProviderConfigured && (!env.SESSION_SECRET || env.SESSION_SECRET === 'replace-with-secure-random-string' || env.SESSION_SECRET.trim() === '')) {
        console.error('Configuration Error: SESSION_SECRET is not configured.');
        return null;
    }

    const cookieHeader = request.headers.get('Cookie');
    const cookies = parseCookies(cookieHeader);
    const sessionCookie = cookies['session'];
    if (!sessionCookie) return null;

    const [dataB64, signatureB64] = sessionCookie.split('.');
    if (!dataB64 || !signatureB64) return null;

    const data = atob(dataB64);
    const signature = atob(signatureB64);

    const expectedSignature = await sign(data, env.SESSION_SECRET);
    if (signature !== expectedSignature) return null;

    try {
        return JSON.parse(data) as UserProfile;
    } catch {
        return null;
    }
}
