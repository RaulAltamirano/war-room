import assert from 'node:assert/strict';
import test from 'node:test';
import { banZones, buildBanZonesPayload, runDiscordBanZones } from '../scripts/lib/ban-zones.mjs';

function member(name, miss, pos, impact = 0) {
  const mp = pos ? Math.round((miss * 100) / pos) : 0;
  const s = [impact, 0, 0, mp, miss, 0, 0, 0, 0, 0, 0, 0, 0, 0, pos];
  return [name, 'M', s, 15, 1, []];
}

test('2 guerras seguidas sin atacar → zona roja', () => {
  const wars = [
    { date: '2026-10-11', members: [member('jaimerrdd', 2, 2, 0), member('kssto', 0, 2, 90)] },
    { date: '2026-10-13', members: [member('jaimerrdd', 2, 2, 0), member('kssto', 0, 2, 95)] },
  ];
  const z = banZones(wars, [['jaimerrdd', 'M', 15, 1, 0, 0, 0], ['kssto', 'M', 15, 1, 100, 0, 0]]);
  assert.ok(z.red.some((x) => x.n === 'jaimerrdd' && x.streak === 2));
  assert.equal(z.red.some((x) => x.n === 'kssto'), false);
  assert.equal(z.grey.some((x) => x.n === 'kssto'), false);
});

test('1 guerra sin atacar → zona gris', () => {
  const wars = [
    { date: '2026-10-11', members: [member('kssto', 0, 2, 90)] },
    { date: '2026-10-13', members: [member('ADES', 2, 2, 0), member('kssto', 0, 2, 90)] },
  ];
  const z = banZones(wars, []);
  assert.equal(z.red.some((x) => x.n === 'ADES'), false);
  assert.ok(z.grey.some((x) => x.n === 'ADES' && x.lastFull));
});

test('fuera con rachas cortas queda en gris, no roja', () => {
  const wars = [
    { date: '2026-10-03', members: [member('KOLET', 1, 1, 40)] },
    { date: '2026-10-04', members: [member('KOLET', 0, 1, 50)] },
    { date: '2026-10-13', members: [member('KOLET', 2, 2, 0)] },
  ];
  const z = banZones(wars, []);
  assert.equal(z.red.some((x) => x.n === 'KOLET'), false);
  assert.ok(z.grey.some((x) => x.n === 'KOLET'));
});

test('payload Discord trae aviso y zonas', () => {
  const site = {
    clan: { name: 'clandestinos' },
    roster: [],
    wars: [
      { date: '2026-10-11', members: [member('A', 2, 2, 0)] },
      { date: '2026-10-13', members: [member('A', 2, 2, 0), member('B', 2, 2, 0)] },
    ],
  };
  const { payload, zones } = buildBanZonesPayload(site);
  assert.ok(zones.red.some((x) => x.n === 'A'));
  assert.ok(zones.grey.some((x) => x.n === 'B'));
  assert.match(payload.embeds[0].description, /2 guerras seguidas/);
  assert.match(payload.embeds[0].fields[0].name, /roja/i);
  assert.match(payload.embeds[0].fields[1].name, /gris/i);
});

test('runDiscordBanZones solo postea con force', async () => {
  let posts = 0;
  const site = { clan: { name: 'c' }, roster: [], wars: [] };
  const idle = await runDiscordBanZones({
    site,
    force: false,
    webhookUrl: 'https://discord.example/hook',
    fetchImpl: async () => { posts += 1; return { ok: true }; },
    log: () => {},
  });
  assert.equal(idle.posted, false);
  assert.equal(posts, 0);
  const sent = await runDiscordBanZones({
    site,
    force: true,
    webhookUrl: 'https://discord.example/hook',
    fetchImpl: async (_u, opts) => {
      posts += 1;
      assert.match(JSON.parse(opts.body).embeds[0].title, /Aviso/);
      return { ok: true };
    },
    log: () => {},
  });
  assert.equal(sent.posted, true);
  assert.equal(posts, 1);
});
