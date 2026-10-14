import assert from 'node:assert/strict';
import test from 'node:test';
import { formatBitacoraDiscord, formatWarDiscord, runDiscordBitacora, runDiscordWars, warsToAnnounce } from '../scripts/lib/discord-wars.mjs';

const sample = {
  id: 'w20261011',
  date: '2026-10-11',
  rival: 'BUILT 2 WAR',
  res: 'D',
  stars: [59, 60],
  members: [
    ['Alpha', 'M', [100, 3, 3, 0, 0, 3, 100, 0, 0, 0, 0, 0, 0, 0, 2], 15, 1, []],
    ['Beta', 'M', [70, 2, 2, 0, 0, 1, 50, 50, 0, 0, 0, 0, 0, 0, 2], 15, 2, []],
  ],
};

test('formatWarDiscord resume como la bitácora', () => {
  const text = formatWarDiscord(sample);
  assert.match(text, /BUILT 2 WAR/);
  assert.match(text, /Derrota/);
  assert.match(text, /59 — 60/);
  assert.match(text, /Alpha/);
});

test('primer run hace bootstrap sin postear', async () => {
  let posts = 0;
  const out = await runDiscordWars({
    wars: [sample],
    state: { bootstrapped: false, wars: {} },
    webhookUrl: 'https://discord.example/hook',
    fetchImpl: async () => { posts += 1; return { ok: true }; },
    log: () => {},
  });
  assert.equal(out.bootstrapped, true);
  assert.equal(posts, 0);
  assert.ok(out.state.wars.w20261011);
});

test('guerra nueva se anuncia una vez', async () => {
  let posts = 0;
  const bodies = [];
  const state = {
    bootstrapped: true,
    wars: { w20261003: { postedAt: '2026-10-03T00:00:00.000Z' } },
  };
  const out = await runDiscordWars({
    wars: [{ id: 'w20261003', date: '2026-10-03', rival: 'Old', res: 'V', stars: [1, 0], members: [] }, sample],
    state,
    webhookUrl: 'https://discord.example/hook',
    fetchImpl: async (_u, opts) => {
      posts += 1;
      bodies.push(JSON.parse(opts.body));
      return { ok: true };
    },
    log: () => {},
  });
  assert.equal(out.posted, 1);
  assert.equal(posts, 1);
  assert.match(bodies[0].content, /BUILT 2 WAR/);
  assert.ok(out.state.wars.w20261011);

  const again = await runDiscordWars({
    wars: [sample],
    state: out.state,
    webhookUrl: 'https://discord.example/hook',
    fetchImpl: async () => { posts += 1; return { ok: true }; },
    log: () => {},
  });
  assert.equal(again.posted, 0);
  assert.equal(posts, 1);
});

test('warsToAnnounce lista pendientes tras bootstrap', () => {
  const plan = warsToAnnounce([sample], { bootstrapped: true, wars: {} });
  assert.equal(plan.mode, 'post');
  assert.equal(plan.pending.length, 1);
});

test('formatBitacoraDiscord lista el historial', () => {
  const text = formatBitacoraDiscord([sample], 'clandestinos');
  assert.match(text, /Bitácora/);
  assert.match(text, /BUILT 2 WAR/);
  assert.match(text, /1 guerras/);
});

test('runDiscordBitacora postea el resumen', async () => {
  let posts = 0;
  const out = await runDiscordBitacora({
    wars: [sample],
    clanName: 'clandestinos',
    webhookUrl: 'https://discord.example/hook',
    fetchImpl: async () => { posts += 1; return { ok: true }; },
    log: () => {},
  });
  assert.equal(out.posted, true);
  assert.equal(posts, 1);
});
