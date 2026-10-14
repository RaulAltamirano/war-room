import assert from 'node:assert/strict';
import test from 'node:test';
import {
  closedMonthKey,
  discordContent,
  discordMonthlyPayload,
  scoreMonth,
  shouldPost,
  warsInMonth,
} from '../scripts/lib/monthly-top.mjs';
import { runDiscordMonthly } from '../scripts/discord-monthly.mjs';

function member(name, impact, starsAvg, miss, pos, net, don) {
  const s = [impact, starsAvg, 0, miss && pos ? Math.round((miss * 100) / pos) : 0, miss, net, 0, 0, 0, 0, 0, 0, 0, 0, pos];
  return [name, 'M', s, 15, 1, []];
}

const octWars = [
  {
    id: 'a',
    date: '2026-10-05',
    members: [
      member('Alpha', 100, 3, 0, 2, 4, 0),
      member('Beta', 80, 2, 0, 2, 0, 0),
    ],
  },
  {
    id: 'b',
    date: '2026-10-20',
    members: [
      member('Alpha', 100, 3, 0, 2, 4, 0),
      member('Gamma', 50, 1, 0, 2, -2, 0),
    ],
  },
  {
    id: 'c',
    date: '2026-09-28',
    members: [member('Zeta', 100, 3, 0, 2, 4, 0)],
  },
];

const roster = [
  ['Alpha', 'M', 15, 1, 100, 0, 0],
  ['Beta', 'M', 15, 1, 50, 0, 0],
  ['Gamma', 'M', 15, 1, 0, 0, 0],
  ['Zeta', 'M', 15, 1, 999, 0, 0],
];

test('closedMonthKey usa el mes anterior en Mexico City', () => {
  assert.equal(closedMonthKey(new Date('2026-11-01T12:00:00-06:00')), '2026-10');
  assert.equal(closedMonthKey(new Date('2026-01-01T12:00:00-06:00')), '2025-12');
});

test('warsInMonth filtra por YYYY-MM de war.date', () => {
  const rows = warsInMonth(octWars, '2026-10');
  assert.equal(rows.length, 2);
  assert.ok(rows.every((w) => w.date.startsWith('2026-10')));
});

test('scoreMonth aplica 70/30 y elige Top 1', () => {
  const month = warsInMonth(octWars, '2026-10');
  const r = scoreMonth(month, roster);
  assert.equal(r.winner, 'Alpha');
  assert.equal(r.score, 100);
  assert.equal(r.top3.length, 3);
  assert.equal(r.top3[0][0], 'Alpha');
  assert.ok(r.top3[0][1] >= r.top3[1][1]);
});

test('shouldPost es idempotente por mes', () => {
  assert.equal(shouldPost({}, '2026-10'), true);
  assert.equal(shouldPost({ '2026-10': { winner: 'Alpha' } }, '2026-10'), false);
});

test('discordContent menciona pase y ganador', () => {
  const text = discordContent({ winner: 'Alpha', score: 100, top3: [['Alpha', 100], ['Beta', 71]] }, '2026-10');
  assert.match(text, /Alpha/);
  assert.match(text, /pase/i);
  assert.match(text, /octubre/i);
});

test('discordMonthlyPayload usa embed de clandestinos.ops', () => {
  const payload = discordMonthlyPayload(
    { winner: 'Alpha', score: 100, top3: [['Alpha', 100], ['Beta', 71], ['Gamma', 50]] },
    '2026-10',
    { preview: true },
  );
  assert.equal(payload.username, 'clandestinos.ops');
  assert.match(payload.embeds[0].title, /Vista previa/);
  assert.equal(payload.embeds[0].fields.length, 3);
});

test('runDiscordMonthly no postea si falta webhook', async () => {
  let posts = 0;
  const awards = {};
  const out = await runDiscordMonthly({
    site: { wars: octWars, roster },
    awards,
    now: new Date('2026-11-01T12:00:00-06:00'),
    webhookUrl: '',
    fetchImpl: async () => { posts += 1; return { ok: true, status: 204 }; },
    log: () => {},
  });
  assert.equal(out.posted, false);
  assert.equal(posts, 0);
  assert.equal(Object.keys(awards).length, 0);
});

test('runDiscordMonthly postea una vez y guarda award', async () => {
  let posts = 0;
  const awards = {};
  const body = [];
  const out = await runDiscordMonthly({
    site: { wars: octWars, roster },
    awards,
    now: new Date('2026-11-01T12:00:00-06:00'),
    webhookUrl: 'https://discord.example/webhook',
    fetchImpl: async (url, opts) => {
      posts += 1;
      body.push(JSON.parse(opts.body));
      return { ok: true, status: 204 };
    },
    log: () => {},
  });
  assert.equal(out.posted, true);
  assert.equal(posts, 1);
  assert.equal(awards['2026-10'].winner, 'Alpha');
  assert.match(body[0].content, /Alpha/);

  const again = await runDiscordMonthly({
    site: { wars: octWars, roster },
    awards,
    now: new Date('2026-11-01T18:00:00-06:00'),
    webhookUrl: 'https://discord.example/webhook',
    fetchImpl: async () => { posts += 1; return { ok: true, status: 204 }; },
    log: () => {},
  });
  assert.equal(again.posted, false);
  assert.equal(posts, 1);
});

test('runDiscordMonthly no guarda award si Discord falla', async () => {
  const awards = {};
  const out = await runDiscordMonthly({
    site: { wars: octWars, roster },
    awards,
    now: new Date('2026-11-01T12:00:00-06:00'),
    webhookUrl: 'https://discord.example/webhook',
    fetchImpl: async () => ({ ok: false, status: 500 }),
    log: () => {},
  });
  assert.equal(out.posted, false);
  assert.equal(awards['2026-10'], undefined);
});

test('force en mes abierto manda vista previa sin guardar award', async () => {
  const awards = {};
  let body = null;
  const out = await runDiscordMonthly({
    site: { wars: octWars, roster },
    awards,
    now: new Date('2026-10-13T12:00:00-06:00'),
    force: true,
    webhookUrl: 'https://discord.example/webhook',
    fetchImpl: async (_u, opts) => {
      body = JSON.parse(opts.body);
      return { ok: true, status: 204 };
    },
    log: () => {},
  });
  assert.equal(out.posted, true);
  assert.equal(out.preview, true);
  assert.equal(out.monthKey, '2026-10');
  assert.equal(awards['2026-10'], undefined);
  assert.match(body.embeds[0].title, /Vista previa/);
});
