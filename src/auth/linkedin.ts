import { z } from 'zod';
import { GenericOAuth2Provider } from './oauth2';

const LinkedInUserSchema = z.object({
  sub: z.string(),
  name: z.string(),
  email: z.string().optional(),
  picture: z.string().optional(),
});

export const LinkedInProvider = new GenericOAuth2Provider({
  name: 'linkedin',
  clientIdEnvKey: 'LINKEDIN_CLIENT_ID',
  clientSecretEnvKey: 'LINKEDIN_CLIENT_SECRET',
  authEndpoint: 'https://www.linkedin.com/oauth/v2/authorization',
  tokenEndpoint: 'https://www.linkedin.com/oauth/v2/accessToken',
  userInfoEndpoint: 'https://api.linkedin.com/v2/userinfo',
  scopes: ['openid', 'profile', 'email'],
  extractProfile: (data: any) => {
    const userData = LinkedInUserSchema.parse(data);
    return {
      id: userData.sub,
      email: userData.email,
      name: userData.name,
      provider: 'linkedin',
      picture: userData.picture,
    };
  },
});