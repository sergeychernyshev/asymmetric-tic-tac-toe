import { DurableObject } from 'cloudflare:workers';
import type { UserProfile } from './auth/types';

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
    this.ctx.blockConcurrencyWhile(async () => {
      this.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS games (
          gameId TEXT PRIMARY KEY,
          role TEXT,
          timestamp INTEGER
        );
      `);
    });
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
    this.storage.sql.exec(
      'INSERT OR REPLACE INTO games (gameId, role, timestamp) VALUES (?, ?, ?)',
      gameId,
      role,
      Date.now(),
    );

    // Keep only the last 50 games
    this.storage.sql.exec(`
      DELETE FROM games WHERE gameId NOT IN (
        SELECT gameId FROM games
        ORDER BY CASE WHEN role = 'owner' THEN 0 ELSE 1 END, timestamp DESC
        LIMIT 50
      )
    `);
  }

  async deleteGame(gameId: string): Promise<void> {
    this.storage.sql.exec('DELETE FROM games WHERE gameId = ?', gameId);
  }

  async getGames(): Promise<GameRecord[]> {
    const result = this.storage.sql.exec(
      "SELECT gameId, role, timestamp FROM games ORDER BY CASE WHEN role = 'owner' THEN 0 ELSE 1 END, timestamp DESC LIMIT 50",
    );
    return result.toArray() as unknown as GameRecord[];
  }
}
