import { Mark, Player, State, TicTacToeDO } from './do';
import { handleAuth, verifySession } from './auth/';
import { renderGame } from './templates/game';
import { renderIndex } from './templates/landing';

export { TicTacToeDO } from './do';

export default {
  /**
   * This is the standard fetch handler for a Cloudflare Worker
   *
   * @param request - The request submitted to the Worker from the client
   * @param env - The interface to reference bindings declared in wrangler.jsonc
   * @param ctx - The execution context of the Worker
   * @returns The response to be sent back to the client
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/').filter((p) => p);

    // Auth Routes
    if (pathParts.length > 0 && pathParts[0] === 'auth') {
      return handleAuth(request, env);
    }

    // // API Routes
    // if (pathParts.length > 1 && pathParts[0] === 'api' && pathParts[1] === 'me') {
    //   const user = await verifySession(request, env);
    //   if (user) {
    //     return new Response(JSON.stringify(user), {
    //       headers: { 'Content-Type': 'application/json' },
    //     });
    //   }
    //   return new Response('Unauthorized', { status: 401 });
    // }

    let gameID: string | null = null;
    let token: string | null = null;
    let isWebsocket = false;
    let isEmbed = false;

    // 1. Check for WebSocket request via query params (standard /websocket route)
    if (pathParts.length > 0 && pathParts[0] === 'websocket') {
      isWebsocket = true;
      gameID = url.searchParams.get('game');
      token = url.searchParams.get('token');
    }
    // 2. Check for path-based routing (e.g., /ABC-123)
    else if (pathParts.length > 0 && pathParts[0].match(/^[a-zA-Z]{3}-[0-9]{3}$/)) {
      gameID = pathParts[0].toUpperCase();

      if (pathParts.length > 1) {
        if (pathParts[1] === 'embed') {
          isEmbed = true;
        } else {
          token = pathParts[1];
        }
      }
    } else if (pathParts.length === 0 || pathParts[0] === 'index.html') {
      const providers = [];
      if (env.GOOGLE_CLIENT_ID) providers.push({ name: 'Google', url: '/auth/google', class: 'google' });
      if (env.TWITCH_CLIENT_ID) providers.push({ name: 'Twitch', url: '/auth/twitch', class: 'twitch' });
      if (env.LINKEDIN_CLIENT_ID) providers.push({ name: 'LinkedIn', url: '/auth/linkedin', class: 'linkedin' });

      const user = await verifySession(request, env);
      const html = renderIndex(providers, user);

      return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    if (gameID !== null) {
      gameID = gameID.toUpperCase();
    }
    if (!gameID || !gameID.match(/^[A-Z]{3}-[0-9]{3}$/)) {
      gameID = '';
    }

    let id: DurableObjectId = env.TIC_TAC_TOE_DO.idFromName(gameID);

    // This stub creates a communication channel with the Durable Object instance
    // The Durable Object constructor will be invoked upon the first call for a given id
    let stub: DurableObjectStub<TicTacToeDO> = env.TIC_TAC_TOE_DO.get(id);

    // if token is provided, check if it is valid
    if (token !== null && !(await stub.checkToken(token))) {
      return new Response('Invalid token', { status: 403 });
    }

    if (gameID && !isWebsocket) {
      let headers = new Headers();
      headers.set('Content-type', 'text/html; charset=utf-8');
      headers.set('Cache-control', 'no-store');

      // reading state to populate HTML on the server-side
      const state: State = await stub.getState();

      // favicon logic
      let favicon = '/x-favicon.png';
      if (state.settings.streamerMark === Mark.X) {
        if (state.turn === Player.STREAMER) {
          favicon = '/x-favicon.png';
        } else {
          favicon = '/o-favicon.png';
        }
      } else {
        if (state.turn === Player.CHAT) {
          favicon = '/x-favicon.png';
        } else {
          favicon = '/o-favicon.png';
        }
      }

      // turn classes logic
      let streamerTurnClass = '';
      let chatTurnClass = '';
      if (state.turn === Player.STREAMER) {
        streamerTurnClass = state.settings.streamerMark === Mark.X ? 'x turn' : 'o turn';
        chatTurnClass = state.settings.streamerMark === Mark.X ? 'o' : 'x';
      } else {
        streamerTurnClass = state.settings.streamerMark === Mark.X ? 'x' : 'o';
        chatTurnClass = state.settings.streamerMark === Mark.X ? 'o turn' : 'x turn';
      }

      // links logic
      const chatLink = `${url.origin}/${gameID}`;
      const embedLink = `${url.origin}/${gameID}/embed`;
      const streamerLink = token ? `${url.origin}/${gameID}/${token}` : chatLink;
      const streamerDisplayLink = token ? `${url.origin}/${gameID}/*****` : chatLink;

      const html = renderGame(
        state,
        gameID,
        favicon,
        streamerTurnClass,
        chatTurnClass,
        chatLink,
        embedLink,
        streamerLink,
        streamerDisplayLink,
        token,
      );

      return new Response(html, { headers });
    }

    /**
     * Web Socket server for UI passing requests over to DO
     */
    if (isWebsocket) {
      // Expect to receive a WebSocket Upgrade request.
      // If there is one, accept the request and return a WebSocket Response.
      const upgradeHeader = request.headers.get('Upgrade');
      if (!upgradeHeader || upgradeHeader !== 'websocket') {
        return new Response('Durable Object expected Upgrade: websocket', {
          status: 426,
        });
      }

      return stub.fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};
