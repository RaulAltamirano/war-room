import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildClanPayload,
  buildProspectsPayload,
  buildReportPayload,
  buildTop3Payload,
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

test('un cambio de firma sin highlight pendiente no manda el informe', async () => {
  let posts = 0;
  const out = await runDiscordReport({
    site,
    state: { bootstrapped: true, signature: 'vieja', postedAt: null },
    saved: [],
    webhookUrl: 'https://discord.example/hook',
    fetchImpl: async () => { posts += 1; return { ok: true }; },
    log: () => {},
  });
  assert.equal(out.posted, false);
  assert.equal(out.reason, 'updated');
  assert.equal(posts, 0);
  assert.equal(out.state.signature, buildBriefing(site).signature);
});

test('highlight fallido queda pendiente y no cae al informe de 4 embeds', async () => {
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
        members: [member('Alpha', 100, 3, 0, 2, 4)],
      },
      {
        id: 'w20261015',
        date: '2026-10-15',
        rival: 'OTHER',
        res: 'D',
        stars: [10, 20],
        members: [member('Beta', 40, 1, 0, 2, 0)],
      },
    ],
  };
  const failed = await runDiscordReport({
    site: highlightSite,
    state: { bootstrapped: true, signature: 'w1|w2', postedAt: null },
    saved: ['20261013-AAAA.json', '20261015-BBBB.json'],
    webhookUrl: 'https://discord.example/hook',
    fetchImpl: async () => { throw new Error('network'); },
    log: () => {},
  });
  assert.equal(failed.posted, false);
  assert.equal(failed.reason, 'http');
  assert.deepEqual(failed.state.pendingHighlights, ['20261013-AAAA.json', '20261015-BBBB.json']);
  assert.equal(failed.state.signature, 'w1|w2');

  const bodies = [];
  let n = 0;
  const retry = await runDiscordReport({
    site: highlightSite,
    state: failed.state,
    saved: [],
    webhookUrl: 'https://discord.example/hook',
    fetchImpl: async (_u, opts) => {
      n += 1;
      if (n === 1) return { ok: false, status: 500 };
      bodies.push(JSON.parse(opts.body));
      return { ok: true };
    },
    log: () => {},
  });
  assert.equal(retry.posted, true);
  assert.equal(retry.reason, 'war-ended');
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].embeds.length, 1);
  assert.deepEqual(retry.state.pendingHighlights, ['20261013-AAAA.json']);
  assert.equal(retry.state.highlights['20261015-BBBB.json'].warId, 'w20261015');
  assert.equal(retry.state.signature, 'w1|w2');
});

test('buildBriefing arma top3, análisis y prospectos', () => {
  const b = buildBriefing(site);
  assert.equal(b.top3.length, 3);
  assert.equal(b.top3[0].n, 'Alpha');
  assert.ok(b.trend.out.some((x) => x.n === 'Delta'));
  assert.equal(b.prospects.some((p) => p.n === 'Delta'), false);
  assert.ok(b.prospects.some((p) => p.n === 'Alpha'));
});

test('prospectos no incluyen a quien ya no está en el roster', () => {
  const ghostSite = {
    ...site,
    wars: [
      ...site.wars,
      {
        id: 'w3',
        date: '2026-10-15',
        rival: 'X',
        res: 'V',
        stars: [10, 0],
        members: [member('Ghost', 90, 3, 0, 2, 2)],
      },
    ],
  };
  const b = buildBriefing(ghostSite);
  assert.equal(b.prospects.some((p) => p.n === 'Ghost'), false);
  assert.ok(b.prospects.some((p) => p.n === 'Alpha'));
});

test('buildReportPayload es un informe general sin guerra ni Top 3', () => {
  const { payload } = buildReportPayload(site);
  assert.equal(payload.embeds.length, 1);
  assert.match(payload.embeds[0].title, /Estado del clan/);
  assert.equal(payload.embeds[0].description.includes('Última guerra'), false);
  assert.equal(payload.embeds[0].description.includes('Abrir bitácora'), false);
  assert.equal(payload.embeds[0].description.includes('Atajos'), false);
  assert.match(payload.embeds[0].description, /últimas 2/i);
  assert.equal(payload.embeds[0].fields.length, 3);
  assert.match(payload.embeds[0].fields[0].name, /Impacto al alza/);
  assert.match(payload.embeds[0].fields[1].name, /Impacto a la baja/);
  assert.match(payload.embeds[0].fields[2].name, /Cupo de ataques/);
  assert.ok(payload.embeds.every((e) => typeof e.color === 'number'));
});

test('buildTop3Payload es ranking acumulado, no la última guerra', () => {
  const { payload } = buildTop3Payload(site);
  assert.equal(payload.embeds.length, 1);
  assert.match(payload.embeds[0].title, /Top 3/);
  assert.match(payload.embeds[0].description, /acumulado/i);
  assert.equal(payload.embeds[0].description.includes('Última guerra'), false);
  assert.match(payload.embeds[0].description, /🥇/);
  assert.match(payload.embeds[0].description, /Alpha/);
  assert.equal(payload.embeds[0].fields.length, 3);
  assert.match(payload.embeds[0].footer.text, /Ranking acumulado/);
});

test('shouldSendReport solo envía el informe largo con force', () => {
  assert.equal(shouldSendReport({ bootstrapped: false }, 'a|b').send, false);
  assert.equal(shouldSendReport({ bootstrapped: true, signature: 'a|b' }, 'a|b').send, false);
  assert.equal(shouldSendReport({ bootstrapped: true, signature: 'a' }, 'a|b').send, false);
  assert.equal(shouldSendReport({ bootstrapped: true, signature: 'a' }, 'a|b').reason, 'updated');
  assert.equal(shouldSendReport({ bootstrapped: true, signature: 'a|b' }, 'a|b', { force: true }).send, true);
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

test('force con saved envía el highlight y después el informe', async () => {
  const bodies = [];
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
        members: [member('Alpha', 100, 3, 0, 2, 4)],
      },
    ],
  };
  const out = await runDiscordReport({
    site: highlightSite,
    state: { bootstrapped: true, signature: 'w1|w2', postedAt: null },
    force: true,
    warEnded: true,
    saved: ['20261013-AAAA.json'],
    webhookUrl: 'https://discord.example/hook',
    fetchImpl: async (_u, opts) => {
      bodies.push(JSON.parse(opts.body));
      return { ok: true };
    },
    log: () => {},
  });
  assert.equal(out.posted, true);
  assert.equal(out.reason, 'force');
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].embeds.length, 1);
  assert.match(bodies[0].embeds[0].title, /Guerra terminada/);
  assert.equal(bodies[1].embeds.length, 1);
  assert.match(bodies[1].embeds[0].title, /Estado del clan/);
  assert.equal(out.state.highlights['20261013-AAAA.json'].warId, 'w20261013');
});

test('force sin warEnded sigue enviando el informe general', async () => {
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
      assert.equal(body.embeds.length, 1);
      assert.match(body.embeds[0].title, /Estado del clan/);
      assert.equal(body.embeds[0].fields.length, 3);
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
  assert.match(payload.embeds[0].title, /próxima guerra|Alineación/i);
  assert.ok(payload.embeds[0].fields.some((f) => f.name === 'Alineación'));
});

test('buildClanPayload enfatiza racha API y badge, sin bitácora ni tag', () => {
  const siteClan = {
    ...site,
    clan: {
      name: 'clandestinos',
      tag: '#2RGC02RYC',
      level: 6,
      w: 11,
      l: 22,
      t: 0,
      streak: 3,
      league: 'Plata I',
      capLeague: 'Bronce',
      members: 35,
      trophies: 100,
      builder: 50,
      capital: 10,
      freq: 'Siempre',
      badge: 'https://example.test/badge.png',
    },
  };
  const { payload } = buildClanPayload(siteClan);
  assert.equal(payload.embeds.length, 1);
  assert.match(payload.embeds[0].title, /clandestinos/);
  assert.equal(payload.embeds[0].description.includes('#2RGC02RYC'), false);
  assert.match(payload.embeds[0].description, /Racha de victorias: 3/);
  assert.match(payload.embeds[0].description, /No la rompan|racha/i);
  assert.equal(payload.embeds[0].fields.some((f) => /bitácora/i.test(f.name)), false);
  assert.match(payload.embeds[0].fields[0].value, /\*\*11\*\* V/);
  assert.equal(payload.embeds[0].thumbnail.url, 'https://example.test/badge.png');
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
      assert.match(body.embeds[0].title, /próxima guerra|Alineación/i);
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
      assert.equal(body.embeds.length, 1);
      assert.match(body.embeds[0].title, /Estado del clan/);
      return { ok: true };
    },
    log: () => {},
  });
  assert.equal(forced.posted, true);
  assert.equal(posts, 1);
});
