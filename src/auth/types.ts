export interface UserProfile {
  id: string;
  email?: string;
  name: string;
  provider: string;
  picture?: string;
}

export interface AuthProvider {
  name: string;
  getAuthUrl(env: Env, state: string, origin: string): string;
  getUser(env: Env, code: string, origin: string): Promise<UserProfile>;
}
