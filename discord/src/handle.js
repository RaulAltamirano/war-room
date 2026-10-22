import { memberHasAllowedRole, parseAllowedRoleIds, resolveCommand } from './commands.js';
import { verifyDiscordRequest } from './verify.js';

export const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
};

export const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
};

const EPHEMERAL = 64;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function loadSite(siteJsonUrl, fetchImpl = fetch) {
  const res = await fetchImpl(siteJsonUrl, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'clandestinos-ops (war-room slash commands)',
    },
  });
  if (!res.ok) {
    const err = new Error(`site.json HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function patchOriginal(applicationId, token, body, fetchImpl = fetch, files = []) {
  const url = `https://discord.com/api/v10/webhooks/${applicationId}/${token}/messages/@original`;
  let res;
  if (files.length) {
    const form = new FormData();
    const payload = {
      ...body,
      // Required on PATCH so Discord binds uploaded files to attachment:// refs.
      attachments: files.map((f, i) => ({
        id: i,
        filename: f.name || `file${i}`,
      })),
    };
    form.append('payload_json', JSON.stringify(payload));
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      form.append(
        `files[${i}]`,
        new Blob([f.bytes], { type: f.type || 'application/octet-stream' }),
        f.name || `file${i}`,
      );
    }
    res = await fetchImpl(url, { method: 'PATCH', body: form });
  } else {
    res = await fetchImpl(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  let detail = '';
  if (!res.ok) {
    try {
      detail = (await res.text()).slice(0, 180);
    } catch {
      detail = '';
    }
  }
  return { ok: res.ok, status: res.status, detail };
}

/**
 * Process one Discord interaction HTTP request.
 * @param {Request} request
 * @param {object} env
 * @param {{ waitUntil?: (p: Promise<unknown>) => void, fetchImpl?: typeof fetch, now?: Date }} [runtime]
 */
export async function handleInteractionRequest(request, env, runtime = {}) {
  const fetchImpl = runtime.fetchImpl || fetch;
  const waitUntil = runtime.waitUntil || ((p) => { void p; });

  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const signature = request.headers.get('X-Signature-Ed25519') || '';
  const timestamp = request.headers.get('X-Signature-Timestamp') || '';
  const rawBody = await request.text();

  const publicKey = String(env.DISCORD_PUBLIC_KEY || '').trim();
  const valid = await verifyDiscordRequest(rawBody, signature.trim(), timestamp.trim(), publicKey);
  if (!valid) {
    return new Response('invalid request signature', { status: 401 });
  }

  let interaction;
  try {
    interaction = JSON.parse(rawBody);
  } catch {
    return new Response('bad json', { status: 400 });
  }

  if (interaction.type === InteractionType.PING) {
    return jsonResponse({ type: InteractionResponseType.PONG });
  }

  if (interaction.type !== InteractionType.APPLICATION_COMMAND) {
    return jsonResponse({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: 'Unsupported interaction type.', flags: EPHEMERAL },
    });
  }

  const allowedRoles = parseAllowedRoleIds(env.ALLOWED_ROLE_IDS);
  if (!memberHasAllowedRole(interaction.member, allowedRoles)) {
    return jsonResponse({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: 'You need an allowed leadership role to run this command.',
        flags: EPHEMERAL,
      },
    });
  }

  const name = interaction.data?.name;
  // Prefer the id Discord sent on the interaction (avoids a wrong Worker secret).
  const applicationId = String(interaction.application_id || env.DISCORD_APPLICATION_ID || '').trim();
  const siteUrl = env.SITE_JSON_URL;

  if (!applicationId || !siteUrl) {
    return jsonResponse({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: 'Bot misconfigured: missing application_id or SITE_JSON_URL.',
        flags: EPHEMERAL,
      },
    });
  }

  waitUntil((async () => {
    try {
      const site = await loadSite(siteUrl, fetchImpl);
      const message = resolveCommand(name, site, { now: runtime.now || new Date() });
      const followUp = message.embeds
        ? { embeds: message.embeds }
        : { content: message.content, flags: message.flags };
      const res = await patchOriginal(
        applicationId,
        interaction.token,
        followUp,
        fetchImpl,
        message.files || [],
      );
      if (!res.ok) {
        await patchOriginal(
          applicationId,
          interaction.token,
          {
            content: `Failed to post embeds (Discord HTTP ${res.status}). ${res.detail || ''}`.trim(),
            flags: EPHEMERAL,
          },
          fetchImpl,
        );
      }
    } catch (err) {
      await patchOriginal(
        applicationId,
        interaction.token,
        {
          content: `Could not load clan data: ${err?.message || 'unknown error'}.`,
          flags: EPHEMERAL,
        },
        fetchImpl,
      );
    }
  })());

  return jsonResponse({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });
}
