import { handleInteractionRequest } from './handle.js';
import { TOP3_FILENAME, TOP3_MIME, top3Bytes } from './top3-thumb.js';

/**
 * Cloudflare Worker entry — Discord Interactions Endpoint URL should point here.
 * Also serves /assets/top3.jpg for embeds that cannot use attachment://.
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === `/assets/${TOP3_FILENAME}`) {
      return new Response(top3Bytes(), {
        headers: {
          'Content-Type': TOP3_MIME,
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
    return handleInteractionRequest(request, env, {
      waitUntil: (promise) => ctx.waitUntil(promise),
    });
  },
};
