import pageTemplate from './game.html';
import { CHAT_TURN_TIME_MAX, CHAT_TURN_TIME_MIN, GameMode, Mark, Player, State, TicTacToeDO } from './do';

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

      page = page.replace(/{{modeRegular}}/g, `${state.settings.mode === GameMode.REGULAR ? 'checked' : ''}`);
      page = page.replace(/{{modeVote}}/g, `${state.settings.mode === GameMode.VOTE ? 'checked' : ''}`);

      page = page.replace(/{{chatTurnTime}}/g, `${state.settings.chatTurnTime}`);
      page = page.replace(/{{chatTurnTimeMin}}/g, `${CHAT_TURN_TIME_MIN}`);
      page = page.replace(/{{chatTurnTimeMax}}/g, `${CHAT_TURN_TIME_MAX}`);
      page = page.replace(/{{gamesPerRound}}/g, `${state.settings.gamesPerRound}`);

      // links
      const chatLink = `${url.origin}/${gameID}`;
      page = page.replace(/{{chatLink}}/g, chatLink);

      const embedLink = `${url.origin}/${gameID}/embed`;
      page = page.replace(/{{embedLink}}/g, embedLink);

      const streamerLink = token ? `${url.origin}/${gameID}/${token}` : chatLink;
      page = page.replace(/{{streamerLink}}/g, streamerLink);

      const streamerDisplayLink = token ? `${url.origin}/${gameID}/*****` : chatLink;
      page = page.replace(/{{streamerDisplayLink}}/g, streamerDisplayLink);

      // Remove settings and links panels if not authorized
      if (!token) {
        page = page.replace(/<section class="share">[\s\S]*?<\/section>/g, '');
        page = page.replace(/<section class="settings">[\s\S]*?<\/section>/g, '');
        page = page.replace(/<section class="links-panel">[\s\S]*?<\/section>/g, '');
      }

      return new Response(page, { headers });
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
