import { z } from 'zod';
import { GenericOAuth2Provider } from './oauth2';

const TwitchUserSchema = z.object({
  id: z.string(),
  login: z.string(),
  display_name: z.string(),
  email: z.string().optional(),
  profile_image_url: z.string().optional(),
});

export const TwitchProvider = new GenericOAuth2Provider({
  name: 'twitch',
  clientIdEnvKey: 'TWITCH_CLIENT_ID',
  clientSecretEnvKey: 'TWITCH_CLIENT_SECRET',
  authEndpoint: 'https://id.twitch.tv/oauth2/authorize',
  tokenEndpoint: 'https://id.twitch.tv/oauth2/token',
  userInfoEndpoint: 'https://api.twitch.tv/helix/users',
  scopes: ['user:read:email'],
  getUserInfoHeaders: (env, tokenData) => {
    return {
      'Client-Id': env.TWITCH_CLIENT_ID,
    };
  },
  extractProfile: (data: any) => {
    if (!data.data || data.data.length === 0) throw new Error('No user data found');
    const userData = TwitchUserSchema.parse(data.data[0]);
    return {
      id: userData.id,
      email: userData.email || '',
      name: userData.display_name,
      provider: 'twitch',
      picture: userData.profile_image_url,
    };
  },
});
