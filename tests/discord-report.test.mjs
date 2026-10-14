import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReportPayload, runDiscordReport, shouldSendReport } from '../scripts/lib/discord-report.mjs';
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
  const { payload } = buildReportPayload(site, { pageUrl: 'https://example.com' });
  assert.equal(payload.embeds.length, 4);
  assert.match(payload.embeds[0].title, /Informe/);
  assert.match(payload.embeds[1].title, /Top 3/);
  assert.match(payload.embeds[2].title, /Análisis/);
  assert.match(payload.embeds[3].title, /Prospectos/);
  assert.ok(payload.embeds.every((e) => typeof e.color === 'number'));
});

test('shouldSendReport respeta bootstrap y force', () => {
  assert.equal(shouldSendReport({ bootstrapped: false }, 'a|b').send, false);
  assert.equal(shouldSendReport({ bootstrapped: true, signature: 'a|b' }, 'a|b').send, false);
  assert.equal(shouldSendReport({ bootstrapped: true, signature: 'a' }, 'a|b').send, true);
  assert.equal(shouldSendReport({ bootstrapped: true, signature: 'a|b' }, 'a|b', { force: true }).send, true);
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
