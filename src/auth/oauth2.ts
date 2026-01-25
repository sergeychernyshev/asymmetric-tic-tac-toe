import { AuthProvider, UserProfile } from './types';

export interface OAuth2Config {
  name: string;
  clientIdEnvKey: keyof Env;
  clientSecretEnvKey: keyof Env;
  authEndpoint: string;
  tokenEndpoint: string;
  userInfoEndpoint: string;
  scopes: string[];
  scopeDelimiter?: string;
  additionalAuthParams?: Record<string, string>;
  getUserInfoHeaders?: (env: Env, tokenData: any) => Record<string, string>;
  extractProfile: (data: any) => UserProfile;
}

export class GenericOAuth2Provider implements AuthProvider {
  name: string;
  config: OAuth2Config;

  constructor(config: OAuth2Config) {
    this.name = config.name;
    this.config = config;
  }

  getAuthUrl(env: Env, state: string, origin: string): string {
    const clientId = env[this.config.clientIdEnvKey] as string;
    if (!clientId) throw new Error(`${this.config.clientIdEnvKey} not set`);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${origin}/auth/${this.name}/callback`,
      response_type: 'code',
      scope: this.config.scopes.join(this.config.scopeDelimiter || ' '),
      state,
      ...(this.config.additionalAuthParams || {}),
    });

    return `${this.config.authEndpoint}?${params.toString()}`;
  }

  async getUser(env: Env, code: string, origin: string): Promise<UserProfile> {
    const clientId = env[this.config.clientIdEnvKey] as string;
    const clientSecret = env[this.config.clientSecretEnvKey] as string;

    if (!clientId || !clientSecret) throw new Error(`${this.config.name} env vars not set`);

    const redirect_uri = `${origin}/auth/${this.name}/callback`;
    console.log(`[${this.name} Auth] Exchanging code for token. Redirect URI: ${redirect_uri}`);

    const tokenParams = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri,
      grant_type: 'authorization_code',
    });

    const tokenResponse = await fetch(this.config.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error(`${this.name} token error:`, errorText);
      throw new Error(`Failed to exchange code: ${tokenResponse.statusText}`);
    }

    const tokenData = (await tokenResponse.json()) as any;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${tokenData.access_token}`,
    };

    if (this.config.getUserInfoHeaders) {
      Object.assign(headers, this.config.getUserInfoHeaders(env, tokenData));
    }

    const userResponse = await fetch(this.config.userInfoEndpoint, {
      headers,
    });

    if (!userResponse.ok) throw new Error('Failed to fetch user info');

    const userData = await userResponse.json();
    return this.config.extractProfile(userData);
  }
}
