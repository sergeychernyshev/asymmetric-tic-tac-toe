import page from './index.html';

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
    console.log('gameID:', gameID);
    if (gameID === null || !gameID.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)) {
      gameID = '';
    }
    console.log('gameID:', gameID);

    let id: DurableObjectId = env.TIC_TAC_TOE_DO.idFromName(gameID);

    // This stub creates a communication channel with the Durable Object instance
    // The Durable Object constructor will be invoked upon the first call for a given id
    let stub = env.TIC_TAC_TOE_DO.get(id);

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
