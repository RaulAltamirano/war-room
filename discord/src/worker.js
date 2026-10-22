import { handleInteractionRequest } from './handle.js';

/**
 * Cloudflare Worker entry — Discord Interactions Endpoint URL should point here.
 */
export default {
  async fetch(request, env, ctx) {
    return handleInteractionRequest(request, env, {
      waitUntil: (promise) => ctx.waitUntil(promise),
    });
  },
};
