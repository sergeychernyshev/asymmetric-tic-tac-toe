import pageTemplate from './game.html';
import { Mark, Player, State, TicTacToeDO } from './do';

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
    const requestPath = url.pathname;

    let gameID = url.searchParams.get('game');
    if (gameID !== null) {
      gameID = gameID.toUpperCase();
    }
    if (gameID === null || !gameID.match(/^[A-Z]{3}-[0-9]{3}$/)) {
      gameID = '';
    }

    let id: DurableObjectId = env.TIC_TAC_TOE_DO.idFromName(gameID);

    // This stub creates a communication channel with the Durable Object instance
    // The Durable Object constructor will be invoked upon the first call for a given id
    let stub: DurableObjectStub<TicTacToeDO> = env.TIC_TAC_TOE_DO.get(id);

    // if token is provided, check if it is valid
    const token = url.searchParams.get('token');
    if (token !== null && !(await stub.checkToken(token))) {
      return new Response('Invalid token', { status: 403 });
    }

    if (gameID && requestPath.endsWith('/play')) {
      let headers = new Headers();
      headers.set('Content-type', 'text/html; charset=utf-8');
      headers.set('Cache-control', 'no-store');

      // reading state to populate HTML on the server-side
      const state: State = await stub.getState();

      let page = new TextDecoder().decode(pageTemplate);

      // embed the state in the HTML for initial render
      page = page.replace(/{{state}}/g, JSON.stringify(state));

      // game ID
      page = page.replace(/{{gameId}}/g, gameID);

      // favicon
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
      page = page.replace(/{{favicon}}/g, favicon);

      // current player and their mark
      if (state.turn === Player.STREAMER) {
        page = page.replace(/{{streamerTurn}}/g, state.settings.streamerMark === Mark.X ? 'x turn' : 'o turn');
        page = page.replace(/{{chatTurn}}/g, state.settings.streamerMark === Mark.X ? 'o' : 'x');
      } else {
        page = page.replace(/{{streamerTurn}}/g, state.settings.streamerMark === Mark.X ? 'x' : 'o');
        page = page.replace(/{{chatTurn}}/g, state.settings.streamerMark === Mark.X ? 'o turn' : 'x turn');
      }

      // board state
      page = page.replace(/{{cell00}}/g, state.board[0][0] === Mark.X ? 'x disabled' : state.board[0][0] === Mark.O ? 'o disabled' : '');
      page = page.replace(/{{cell10}}/g, state.board[0][1] === Mark.X ? 'x disabled' : state.board[0][1] === Mark.O ? 'o disabled' : '');
      page = page.replace(/{{cell20}}/g, state.board[0][2] === Mark.X ? 'x disabled' : state.board[0][2] === Mark.O ? 'o disabled' : '');
      page = page.replace(/{{cell01}}/g, state.board[1][0] === Mark.X ? 'x disabled' : state.board[1][0] === Mark.O ? 'o disabled' : '');
      page = page.replace(/{{cell11}}/g, state.board[1][1] === Mark.X ? 'x disabled' : state.board[1][1] === Mark.O ? 'o disabled' : '');
      page = page.replace(/{{cell21}}/g, state.board[1][2] === Mark.X ? 'x disabled' : state.board[1][2] === Mark.O ? 'o disabled' : '');
      page = page.replace(/{{cell02}}/g, state.board[2][0] === Mark.X ? 'x disabled' : state.board[2][0] === Mark.O ? 'o disabled' : '');
      page = page.replace(/{{cell12}}/g, state.board[2][1] === Mark.X ? 'x disabled' : state.board[2][1] === Mark.O ? 'o disabled' : '');
      page = page.replace(/{{cell22}}/g, state.board[2][2] === Mark.X ? 'x disabled' : state.board[2][2] === Mark.O ? 'o disabled' : '');

      // settings
      page = page.replace(/{{firstMoveStreamer}}/g, `${state.settings.first === Player.STREAMER ? 'checked' : ''}`);
      page = page.replace(/{{firstMoveChat}}/g, `${state.settings.first === Player.CHAT ? 'checked' : ''}`);

      page = page.replace(/{{streamerMarkX}}/g, `${state.settings.streamerMark === Mark.X ? 'checked' : ''}`);
      page = page.replace(/{{streamerMarkO}}/g, `${state.settings.streamerMark === Mark.O ? 'checked' : ''}`);

      page = page.replace(/{{chatTurnTime}}/g, `${state.settings.chatTurnTime}`);
      page = page.replace(/{{gamesPerRound}}/g, `${state.settings.gamesPerRound}`);

      // links
      const baseUrl = `${url.origin}${url.pathname}?game=${gameID}`;

      const chatUrl = new URL(baseUrl);
      chatUrl.searchParams.delete('token');
      page = page.replace(/{{chatLink}}/g, chatUrl.href);

      const embedUrl = new URL(baseUrl);
      embedUrl.searchParams.delete('token');
      embedUrl.searchParams.set('embed', 'true');
      page = page.replace(/{{embedLink}}/g, embedUrl.href);

      const streamerUrl = new URL(baseUrl);
      if (token) {
        streamerUrl.searchParams.set('token', token);
      }
      page = page.replace(/{{streamerLink}}/g, streamerUrl.href);

      const streamerDisplayUrl = new URL(baseUrl);
      if (token) {
        streamerDisplayUrl.searchParams.set('token', '*****');
      }
      page = page.replace(/{{streamerDisplayLink}}/g, streamerDisplayUrl.href);

      // Remove settings and links panels if not authorized
      if (!token) {
        page = page.replace(/<section class="settings">[\s\S]*?<\/section>/g, '');
        page = page.replace(/<section class="links-panel">[\s\S]*?<\/section>/g, '');
      }

      return new Response(page, { headers });
    }

    /**
     * Web Socket server for UI passing requests over to DO
     */
    if (requestPath.startsWith('/websocket')) {
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
