import { GoogleProvider } from './google';
import { TwitchProvider } from './twitch';
import { LinkedInProvider } from './linkedin';
import { AuthProvider, UserProfile } from './types';

export type { UserProfile, AuthProvider } from './types';
export { GenericOAuth2Provider } from './oauth2';

const providers: Record<string, AuthProvider> = {
  google: GoogleProvider,
  twitch: TwitchProvider,
  linkedin: LinkedInProvider,
};

export async function handleAuth(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter((p) => p);

  const isAnyProviderConfigured = !!(env.GOOGLE_CLIENT_ID || env.TWITCH_CLIENT_ID || env.LINKEDIN_CLIENT_ID);

  if (
    isAnyProviderConfigured &&
    (!env.SESSION_SECRET || env.SESSION_SECRET === 'replace-with-secure-random-string' || env.SESSION_SECRET.trim() === '')
  ) {
    return new Response(
      'Configuration Error: SESSION_SECRET is not configured. Please set it using `wrangler secret put SESSION_SECRET`.',
      { status: 500 },
    );
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

  const origin = (env as any).AUTH_ORIGIN || url.origin;

  if (!isCallback) {
    // Phase 1: Redirect to provider
    const state = crypto.randomUUID();
    const authUrl = provider.getAuthUrl(env, state, origin);
    const returnTo = url.searchParams.get('returnTo');

    const headers = new Headers();
    headers.set('Location', authUrl);
    headers.append('Set-Cookie', `auth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=300; Secure`);
    if (returnTo) {
      headers.append('Set-Cookie', `auth_return_to=${returnTo}; Path=/; HttpOnly; SameSite=Lax; Max-Age=300; Secure`);
    }

    return new Response(null, {
      status: 302,
      headers,
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

      const returnTo = cookies['auth_return_to'] || '/';

      const headers = new Headers();
      headers.set('Location', returnTo);
      headers.append('Set-Cookie', `auth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
      headers.append('Set-Cookie', `auth_return_to=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
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
  header.split(';').forEach((cookie) => {
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
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return String.fromCharCode(...new Uint8Array(signature));
}

export async function verifySession(request: Request, env: Env): Promise<UserProfile | null> {
  const isAnyProviderConfigured = !!(env.GOOGLE_CLIENT_ID || env.TWITCH_CLIENT_ID || env.LINKEDIN_CLIENT_ID);

  if (
    isAnyProviderConfigured &&
    (!env.SESSION_SECRET || env.SESSION_SECRET === 'replace-with-secure-random-string' || env.SESSION_SECRET.trim() === '')
  ) {
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
