import assert from 'node:assert/strict';
import test from 'node:test';
import { COMMAND_DEFINITIONS, memberHasAllowedRole, resolveCommand } from '../discord/src/commands.js';
import {
  InteractionResponseType,
  InteractionType,
  handleInteractionRequest,
} from '../discord/src/handle.js';
import { verifyDiscordRequest } from '../discord/src/verify.js';

function hex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function generateKeyPair() {
  return crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
}

async function publicKeyHex(publicKey) {
  return hex(await crypto.subtle.exportKey('raw', publicKey));
}

async function sign(privateKey, timestamp, body) {
  const message = new TextEncoder().encode(timestamp + body);
  return hex(await crypto.subtle.sign({ name: 'Ed25519' }, privateKey, message));
}

function member(name, impact, starsAvg, miss, pos, net) {
  const s = [impact, starsAvg, 0, miss && pos ? Math.round((miss * 100) / pos) : 0, miss, net, 0, 0, 0, 0, 0, 0, 0, 0, pos];
  return [name, 'M', s, 15, 1, []];
}

const site = {
  clan: { name: 'clandestinos', tag: '#2RGC02RYC' },
  roster: [
    ['Alpha', 'M', 15, 1, 100, 0, 0],
    ['Beta', 'M', 15, 1, 40, 0, 0],
  ],
  wars: [
    {
      id: 'w1',
      date: '2026-10-01',
      rival: 'Rivals',
      res: 'V',
      stars: [30, 10],
      members: [
        member('Alpha', 100, 3, 0, 2, 4),
        member('Beta', 80, 2, 0, 2, 1),
      ],
    },
  ],
};

test('command definitions are guild-safe English slash commands', () => {
  assert.deepEqual(
    COMMAND_DEFINITIONS.map((c) => c.name),
    ['war', 'scout', 'clan', 'top', 'report', 'discipline', 'pass'],
  );
  for (const cmd of COMMAND_DEFINITIONS) {
    assert.equal(cmd.dm_permission, false);
    assert.ok(cmd.default_member_permissions);
    assert.match(cmd.description, /[A-Za-z]/);
  }
});

test('resolveCommand maps to existing embed builders', () => {
  const war = resolveCommand('war', site);
  assert.equal(war.embeds.length, 1);
  assert.match(war.embeds[0].title, /Próxima guerra|Alineación/);
  const scout = resolveCommand('scout', {
    ...site,
    activeWar: {
      state: 'inWar',
      teamSize: 1,
      rival: 'Rivals',
      us: [{ tag: '#A', name: 'Alpha', th: 15, pos: 1 }],
      them: [{ tag: '#R', name: 'R1', th: 15, pos: 1 }],
    },
  });
  assert.equal(scout.embeds.length, 1);
  assert.match(scout.embeds[0].title, /Scout/);
  assert.match(scout.embeds[0].fields.map((f) => f.value).join('\n'), /Alpha/);
  const clan = resolveCommand('clan', {
    ...site,
    clan: {
      ...site.clan,
      w: 11,
      l: 22,
      t: 0,
      streak: 3,
      league: 'Plata I',
      members: 35,
      trophies: 1,
      builder: 2,
      capital: 3,
      freq: 'Siempre',
      badge: 'https://example.test/b.png',
    },
  });
  assert.equal(clan.embeds.length, 1);
  assert.match(clan.embeds[0].title, /clandestinos/);
  assert.match(clan.embeds[0].description, /Racha de victorias: 3/);
  assert.match(clan.embeds[0].fields[0].name, /Record/);
  assert.match(clan.embeds[0].fields[0].value, /11/);
  assert.equal(clan.embeds[0].thumbnail?.url, 'https://example.test/b.png');
  const top = resolveCommand('top', site);
  assert.equal(top.embeds.length, 1);
  assert.match(top.embeds[0].title, /Top 3/);
  assert.match(top.embeds[0].fields[0].name, /Alpha/);
  assert.match(top.embeds[0].fields[0].value, /Donaciones/);
  assert.equal(top.embeds[0].fields.length, 3);
  assert.equal(top.embeds[0].thumbnail.url, 'attachment://top3.jpg');
  assert.equal(top.files?.length, 1);
  assert.equal(top.files[0].name, 'top3.jpg');
  assert.ok(top.files[0].bytes?.length > 100);
  assert.equal(resolveCommand('report', site).embeds.length, 1);
  assert.match(resolveCommand('report', site).embeds[0].title, /Estado del clan/);
  assert.equal(resolveCommand('discipline', site).embeds.length, 1);
  assert.equal(resolveCommand('pass', site, { now: new Date('2026-10-22T12:00:00-06:00') }).embeds.length, 1);
  assert.match(resolveCommand('nope', site).content, /Unknown/);
});

test('memberHasAllowedRole gates optional role allow-list', () => {
  assert.equal(memberHasAllowedRole({ roles: ['1'] }, []), true);
  assert.equal(memberHasAllowedRole({ roles: ['1'] }, ['2']), false);
  assert.equal(memberHasAllowedRole({ roles: ['2', '9'] }, ['2']), true);
});

test('verifyDiscordRequest accepts a valid Ed25519 signature', async () => {
  const { privateKey, publicKey } = await generateKeyPair();
  const pk = await publicKeyHex(publicKey);
  const body = '{"type":1}';
  const ts = '1710000000';
  const sig = await sign(privateKey, ts, body);
  assert.equal(await verifyDiscordRequest(body, sig, ts, pk), true);
  assert.equal(await verifyDiscordRequest(body, sig, '0', pk), false);
  assert.equal(await verifyDiscordRequest(body, '00'.repeat(64), ts, pk), false);
});

test('handleInteractionRequest rejects bad signatures with 401', async () => {
  const res = await handleInteractionRequest(
    new Request('https://example.test/', {
      method: 'POST',
      headers: {
        'X-Signature-Ed25519': '00'.repeat(64),
        'X-Signature-Timestamp': '1',
      },
      body: '{"type":1}',
    }),
    { DISCORD_PUBLIC_KEY: '11'.repeat(32) },
  );
  assert.equal(res.status, 401);
});

test('PING returns PONG after signature verification', async () => {
  const { privateKey, publicKey } = await generateKeyPair();
  const pk = await publicKeyHex(publicKey);
  const body = JSON.stringify({ type: InteractionType.PING });
  const ts = '1710000001';
  const sig = await sign(privateKey, ts, body);
  const res = await handleInteractionRequest(
    new Request('https://example.test/', {
      method: 'POST',
      headers: {
        'X-Signature-Ed25519': sig,
        'X-Signature-Timestamp': ts,
      },
      body,
    }),
    { DISCORD_PUBLIC_KEY: pk },
  );
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { type: InteractionResponseType.PONG });
});

test('slash command defers and patches embeds from site.json', async () => {
  const { privateKey, publicKey } = await generateKeyPair();
  const pk = await publicKeyHex(publicKey);
  const body = JSON.stringify({
    type: InteractionType.APPLICATION_COMMAND,
    application_id: 'app',
    token: 'interaction-token',
    member: { roles: ['leader'] },
    data: { name: 'report' },
  });
  const ts = '1710000002';
  const sig = await sign(privateKey, ts, body);

  const pending = [];
  const patches = [];
  const fetchImpl = async (url, opts = {}) => {
    if (String(url).includes('site.json')) {
      return {
        ok: true,
        async json() {
          return site;
        },
      };
    }
    if (String(url).includes('/messages/@original')) {
      patches.push(JSON.parse(opts.body));
      return { ok: true, status: 200 };
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const res = await handleInteractionRequest(
    new Request('https://example.test/', {
      method: 'POST',
      headers: {
        'X-Signature-Ed25519': sig,
        'X-Signature-Timestamp': ts,
      },
      body,
    }),
    {
      DISCORD_PUBLIC_KEY: pk,
      DISCORD_APPLICATION_ID: 'app',
      SITE_JSON_URL: 'https://example.test/site.json',
    },
    {
      waitUntil: (p) => pending.push(p),
      fetchImpl,
    },
  );

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
  });
  await Promise.all(pending);
  assert.equal(patches.length, 1);
  assert.equal(patches[0].embeds.length, 1);
  assert.match(patches[0].embeds[0].title, /Estado del clan/);
});

test('slash /scout live-fetches active war when COC_API_TOKEN is set', async () => {
  const { privateKey, publicKey } = await generateKeyPair();
  const pk = await publicKeyHex(publicKey);
  const body = JSON.stringify({
    type: InteractionType.APPLICATION_COMMAND,
    application_id: 'app',
    token: 'interaction-token',
    member: { roles: ['leader'] },
    data: { name: 'scout' },
  });
  const ts = '1710000004';
  const sig = await sign(privateKey, ts, body);

  const pending = [];
  const patches = [];
  const fetchImpl = async (url, opts = {}) => {
    const u = String(url);
    if (u.includes('site.json')) {
      return { ok: true, async json() { return { ...site, activeWar: { state: 'notInWar' } }; } };
    }
    if (u.includes('/currentwar') && !u.includes('leaguegroup')) {
      return {
        ok: true,
        async json() {
          return {
            state: 'inWar',
            teamSize: 1,
            attacksPerMember: 2,
            clan: {
              tag: '#2RGC02RYC',
              name: 'clandestinos',
              members: [{ tag: '#A', name: 'Alpha', townhallLevel: 15, mapPosition: 1 }],
            },
            opponent: {
              tag: '#RIV',
              name: 'LiveRival',
              members: [{ tag: '#R', name: 'R1', townhallLevel: 15, mapPosition: 1 }],
            },
          };
        },
      };
    }
    if (u.includes('/messages/@original')) {
      patches.push(JSON.parse(opts.body));
      return { ok: true, status: 200 };
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const res = await handleInteractionRequest(
    new Request('https://example.test/', {
      method: 'POST',
      headers: {
        'X-Signature-Ed25519': sig,
        'X-Signature-Timestamp': ts,
      },
      body,
    }),
    {
      DISCORD_PUBLIC_KEY: pk,
      DISCORD_APPLICATION_ID: 'app',
      SITE_JSON_URL: 'https://example.test/site.json',
      COC_API_TOKEN: 'test-token',
      CLAN_TAG: '#2RGC02RYC',
    },
    {
      waitUntil: (p) => pending.push(p),
      fetchImpl,
    },
  );

  assert.equal(res.status, 200);
  await Promise.all(pending);
  assert.equal(patches.length, 1);
  assert.match(patches[0].embeds[0].title, /LiveRival/);
  assert.match(patches[0].embeds[0].fields.map((f) => f.value).join('\n'), /Alpha/);
});

test('slash /top uploads trophy attachment for thumbnail', async () => {
  const { privateKey, publicKey } = await generateKeyPair();
  const pk = await publicKeyHex(publicKey);
  const body = JSON.stringify({
    type: InteractionType.APPLICATION_COMMAND,
    application_id: 'app',
    token: 'interaction-token',
    member: { roles: ['leader'] },
    data: { name: 'top' },
  });
  const ts = '1710000003';
  const sig = await sign(privateKey, ts, body);

  const pending = [];
  const patches = [];
  const fetchImpl = async (url, opts = {}) => {
    if (String(url).includes('site.json')) {
      return { ok: true, async json() { return site; } };
    }
    if (String(url).includes('/messages/@original')) {
      assert.ok(opts.body instanceof FormData);
      const payload = JSON.parse(opts.body.get('payload_json'));
      patches.push(payload);
      assert.equal(payload.embeds[0].thumbnail.url, 'attachment://top3.jpg');
      assert.deepEqual(payload.attachments, [{ id: 0, filename: 'top3.jpg' }]);
      assert.ok(opts.body.get('files[0]'));
      return { ok: true, status: 200 };
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const res = await handleInteractionRequest(
    new Request('https://example.test/', {
      method: 'POST',
      headers: {
        'X-Signature-Ed25519': sig,
        'X-Signature-Timestamp': ts,
      },
      body,
    }),
    {
      DISCORD_PUBLIC_KEY: pk,
      DISCORD_APPLICATION_ID: 'app',
      SITE_JSON_URL: 'https://example.test/site.json',
    },
    {
      waitUntil: (p) => pending.push(p),
      fetchImpl,
    },
  );

  assert.equal(res.status, 200);
  await Promise.all(pending);
  assert.equal(patches.length, 1);
  assert.match(patches[0].embeds[0].title, /Top 3/);
});
