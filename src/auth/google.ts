import { z } from 'zod';
import { GenericOAuth2Provider } from './oauth2';

const GoogleUserSchema = z.object({
  sub: z.string(),
  name: z.string(),
  email: z.string(),
  picture: z.string().optional(),
});

export const GoogleProvider = new GenericOAuth2Provider({
  name: 'google',
  clientIdEnvKey: 'GOOGLE_CLIENT_ID',
  clientSecretEnvKey: 'GOOGLE_CLIENT_SECRET',
  authEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  userInfoEndpoint: 'https://www.googleapis.com/oauth2/v3/userinfo',
  scopes: ['openid', 'email', 'profile'],
  additionalAuthParams: {
    access_type: 'offline',
    prompt: 'consent',
  },
  extractProfile: (data: any) => {
    const userData = GoogleUserSchema.parse(data);
    return {
      id: userData.sub,
      email: userData.email,
      name: userData.name,
      provider: 'google',
      picture: userData.picture,
    };
  },
});
