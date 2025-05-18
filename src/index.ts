import page from './index.html';

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

    let headers = new Headers();

    if (requestPath.endsWith('/')) {
      headers.set('Content-type', 'text/html; charset=utf-8');
      headers.set('Cache-control', 'no-store');

      return new Response(page, { headers });
    }

    return env.ASSETS.fetch(request);
  },
};
