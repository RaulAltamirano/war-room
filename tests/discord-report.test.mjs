import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildProspectsPayload,
  buildReportPayload,
  runDiscordProspects,
  runDiscordReport,
  shouldSendReport,
} from '../scripts/lib/discord-report.mjs';
import { buildBriefing } from '../scripts/lib/site-metrics.mjs';

function member(name, impact, starsAvg, miss, pos, net) {
  const s = [impact, starsAvg, 0, miss && pos ? Math.round((miss * 100) / pos) : 0, miss, net, 0, 0, 0, 0, 0, 0, 0, 0, pos];
  return [name, 'M', s, 15, 1, []];
}

const site = {
  clan: { name: 'clandestinos', tag: '#2RGC02RYC' },
  roster: [
    ['Alpha', 'M', 15, 1, 100, 0, 0],
    ['Beta', 'M', 15, 1, 40, 0, 0],
    ['Gamma', 'M', 15, 1, 10, 0, 0],
    ['Delta', 'M', 15, 1, 0, 0, 0],
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
        member('Delta', 10, 0, 2, 2, -2),
      ],
    },
    {
      id: 'w2',
      date: '2026-10-08',
      rival: 'Other',
      res: 'D',
      stars: [20, 25],
      members: [
        member('Alpha', 90, 3, 0, 2, 3),
        member('Beta', 40, 1, 0, 2, 0),
        member('Gamma', 70, 2, 0, 2, 1),
        member('Delta', 5, 0, 2, 2, -3),
      ],
    },
  ],
};

test('buildBriefing arma top3, análisis y prospectos', () => {
  const b = buildBriefing(site);
  assert.equal(b.top3.length, 3);
  assert.equal(b.top3[0].n, 'Alpha');
  assert.ok(b.trend.out.some((x) => x.n === 'Delta'));
  assert.equal(b.prospects.some((p) => p.n === 'Delta'), false);
  assert.ok(b.prospects.some((p) => p.n === 'Alpha'));
});

test('buildReportPayload usa embeds Discord', () => {
  const { payload } = buildReportPayload(site);
  assert.equal(payload.embeds.length, 4);
  assert.match(payload.embeds[0].title, /Informe/);
  assert.equal(payload.embeds[0].description.includes('Abrir bitácora'), false);
  assert.match(payload.embeds[1].title, /Top 3/);
  assert.match(payload.embeds[2].title, /Análisis/);
  assert.match(payload.embeds[3].title, /Prospectos/);
  assert.ok(payload.embeds.every((e) => typeof e.color === 'number'));
});

test('shouldSendReport respeta bootstrap, force y war-ended', () => {
  assert.equal(shouldSendReport({ bootstrapped: false }, 'a|b').send, false);
  assert.equal(shouldSendReport({ bootstrapped: true, signature: 'a|b' }, 'a|b').send, false);
  assert.equal(shouldSendReport({ bootstrapped: true, signature: 'a' }, 'a|b').send, true);
  assert.equal(shouldSendReport({ bootstrapped: true, signature: 'a|b' }, 'a|b', { force: true }).send, true);
  assert.equal(shouldSendReport({ bootstrapped: true, signature: 'a|b' }, 'a|b', { warEnded: true }).reason, 'war-ended');
});

test('warEnded envía highlight aunque la firma no cambie', async () => {
  let posts = 0;
  const highlightSite = {
    ...site,
    wars: [
      ...site.wars,
      {
        id: 'w20261013',
        date: '2026-10-13',
        rival: 'SAVAGE',
        res: 'V',
        stars: [54, 0],
        members: [member('Alpha', 100, 3, 0, 2, 4).map((v, i) => (i === 5 ? [[3, 100, 1]] : v))],
      },
    ],
  };
  const state = { bootstrapped: true, signature: 'w1|w2', postedAt: null };
  const out = await runDiscordReport({
    site: highlightSite,
    state,
    warEnded: true,
    saved: ['20261013-AAAA.json'],
    webhookUrl: 'https://discord.example/hook',
    fetchImpl: async (_u, opts) => {
      posts += 1;
      const body = JSON.parse(opts.body);
      assert.equal(body.embeds.length, 1);
      assert.match(body.embeds[0].title, /Guerra terminada/);
      assert.equal(body.embeds[0].description.includes('70% impacto'), false);
      assert.ok(body.embeds[0].fields.some((f) => /Mejores ataques/.test(f.name)));
      assert.equal(body.username, 'clandestinos.ops');
      return { ok: true };
    },
    log: () => {},
  });
  assert.equal(out.posted, true);
  assert.equal(out.reason, 'war-ended');
  assert.equal(posts, 1);
});

test('force sin warEnded sigue enviando informe de 4 embeds', async () => {
  let posts = 0;
  const out = await runDiscordReport({
    site,
    state: { bootstrapped: true, signature: 'w1|w2', postedAt: null },
    force: true,
    warEnded: false,
    webhookUrl: 'https://discord.example/hook',
    fetchImpl: async (_u, opts) => {
      posts += 1;
      const body = JSON.parse(opts.body);
      assert.equal(body.embeds.length, 4);
      assert.match(body.embeds[0].title, /Informe/);
      assert.match(body.embeds[1].title, /Top 3/);
      assert.match(body.embeds[2].title, /Análisis/);
      assert.match(body.embeds[3].title, /Prospectos/);
      return { ok: true };
    },
    log: () => {},
  });
  assert.equal(out.posted, true);
  assert.equal(out.reason, 'force');
  assert.equal(posts, 1);
});

test('buildProspectsPayload es alineación para iniciar guerra', () => {
  const { payload } = buildProspectsPayload(site);
  assert.equal(payload.embeds.length, 1);
  assert.match(payload.embeds[0].title, /iniciar guerra|Alineación/);
  assert.ok(payload.embeds[0].fields.some((f) => f.name === 'Alineación'));
});

test('alineación lista todos los prospectos, sin “…y N más”', () => {
  const big = {
    ...site,
    roster: Array.from({ length: 24 }, (_, i) => [`P${i + 1}`, 'M', 15, 1, 10, 0, 0]),
    wars: [{
      id: 'w1',
      date: '2026-10-01',
      rival: 'R',
      res: 'V',
      stars: [30, 10],
      members: Array.from({ length: 24 }, (_, i) => member(`P${i + 1}`, 80 - (i % 20), 2, 0, 2, 1)),
    }],
  };
  const { payload, briefing } = buildProspectsPayload(big);
  assert.equal(briefing.prospects.length, 24);
  const text = payload.embeds[0].fields.map((f) => f.value).join('\n');
  assert.equal(text.includes('más'), false);
  for (const p of briefing.prospects) {
    assert.match(text, new RegExp(`${p.n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  }
});

test('runDiscordProspects solo postea con force', async () => {
  let posts = 0;
  const idle = await runDiscordProspects({
    site,
    force: false,
    webhookUrl: 'https://discord.example/hook',
    fetchImpl: async () => { posts += 1; return { ok: true }; },
    log: () => {},
  });
  assert.equal(idle.posted, false);
  assert.equal(posts, 0);

  const sent = await runDiscordProspects({
    site,
    force: true,
    webhookUrl: 'https://discord.example/hook',
    fetchImpl: async (_u, opts) => {
      posts += 1;
      const body = JSON.parse(opts.body);
      assert.match(body.embeds[0].title, /Alineación|iniciar/);
      return { ok: true };
    },
    log: () => {},
  });
  assert.equal(sent.posted, true);
  assert.equal(posts, 1);
});

test('runDiscordReport bootstrap no postea; force sí', async () => {
  let posts = 0;
  const boot = await runDiscordReport({
    site,
    state: { bootstrapped: false },
    webhookUrl: 'https://discord.example/hook',
    fetchImpl: async () => { posts += 1; return { ok: true }; },
    log: () => {},
  });
  assert.equal(boot.posted, false);
  assert.equal(boot.state.bootstrapped, true);
  assert.equal(posts, 0);

  const forced = await runDiscordReport({
    site,
    state: boot.state,
    webhookUrl: 'https://discord.example/hook',
    force: true,
    fetchImpl: async (_u, opts) => {
      posts += 1;
      const body = JSON.parse(opts.body);
      assert.equal(body.embeds.length, 4);
      return { ok: true };
    },
    log: () => {},
  });
  assert.equal(forced.posted, true);
  assert.equal(posts, 1);
});
