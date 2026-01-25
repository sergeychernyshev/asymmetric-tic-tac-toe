import { DurableObject } from "cloudflare:workers";
import type { UserProfile } from "./auth/types";

export interface GameRecord {
  gameId: string;
  role: 'owner' | 'player';
  timestamp: number;
}

export class UserDO extends DurableObject<Env> {
  storage: DurableObjectStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.storage = ctx.storage;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/get') {
      const profile = await this.getProfile();
      return new Response(JSON.stringify(profile || null), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (path === '/update' && request.method === 'POST') {
      const data = (await request.json()) as UserProfile;
      await this.updateProfile(data);
      return new Response('OK');
    }

    if (path === '/games/add' && request.method === 'POST') {
      const { gameId, role } = (await request.json()) as { gameId: string; role: 'owner' | 'player' };
      await this.addGame(gameId, role);
      return new Response('OK');
    }

    if (path === '/games/get') {
      const games = await this.getGames();
      return new Response(JSON.stringify(games), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (path === '/games/delete' && request.method === 'POST') {
      const { gameId } = (await request.json()) as { gameId: string };
      await this.deleteGame(gameId);
      return new Response('OK');
    }

    return new Response('Not Found', { status: 404 });
  }

  async getProfile(): Promise<UserProfile | undefined> {
    return await this.storage.get<UserProfile>('profile');
  }

  async updateProfile(profile: UserProfile): Promise<void> {
    await this.storage.put('profile', profile);
  }

  async addGame(gameId: string, role: 'owner' | 'player'): Promise<void> {
    const games = (await this.getGames()) || [];
    
    // Remove existing record if present to update timestamp/role and move to top
    const index = games.findIndex((g) => g.gameId === gameId);
    if (index !== -1) {
      games.splice(index, 1);
    }

    // Add new record to the beginning
    games.unshift({
      gameId,
      role,
      timestamp: Date.now(),
    });

    // Keep only the last 50 games
    if (games.length > 50) {
      games.length = 50;
    }

    await this.storage.put('games', games);
  }

  async deleteGame(gameId: string): Promise<void> {
    const games = (await this.getGames()) || [];
    const index = games.findIndex((g) => g.gameId === gameId);
    if (index !== -1) {
      games.splice(index, 1);
      await this.storage.put('games', games);
    }
  }

  async getGames(): Promise<GameRecord[]> {
    const games = (await this.storage.get<GameRecord[]>('games')) || [];
    return games.sort((a, b) => {
      // Sort by role: 'owner' comes first
      if (a.role === 'owner' && b.role !== 'owner') return -1;
      if (a.role !== 'owner' && b.role === 'owner') return 1;

      // Then sort by timestamp descending (newest first)
      return b.timestamp - a.timestamp;
    });
  }
}