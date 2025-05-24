import pageTemplate from './index.html';
import { Mark, Player } from './do';

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
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const requestPath = url.pathname;

    let gameID = url.searchParams.get('game');
    if (gameID === null || !gameID.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)) {
      gameID = '';
    }

    let id: DurableObjectId = env.TIC_TAC_TOE_DO.idFromName(gameID);

    // This stub creates a communication channel with the Durable Object instance
    // The Durable Object constructor will be invoked upon the first call for a given id
    let stub = env.TIC_TAC_TOE_DO.get(id);

    if (requestPath.endsWith('/')) {
      let headers = new Headers();
      headers.set('Content-type', 'text/html; charset=utf-8');
      headers.set('Cache-control', 'no-store');

      // reading state to populate HTML on the server-side
      const state = await stub.getState();

      let page = new TextDecoder().decode(pageTemplate);

      // embed the state in the HTML for initial render
      page = page.replace(/{{state}}/g, JSON.stringify(state));

      // favicon
      let favicon = '/x-favicon.png';
      if (state.streamerMark === Mark.X) {
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
        page = page.replace(/{{streamerTurn}}/g, state.streamerMark === Mark.X ? 'x turn' : 'o turn');
        page = page.replace(/{{chatTurn}}/g, state.streamerMark === Mark.X ? 'o' : 'x');
      } else {
        page = page.replace(/{{streamerTurn}}/g, state.streamerMark === Mark.X ? 'x' : 'o');
        page = page.replace(/{{chatTurn}}/g, state.streamerMark === Mark.X ? 'o turn' : 'x turn');
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
