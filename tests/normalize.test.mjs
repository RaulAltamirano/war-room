import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { buildSite, fromApi, perOf, summarizeWar, warResult } from '../scripts/lib/normalize.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLAN = '#2RGC02RYC';

async function readJson(rel) {
  return JSON.parse(await readFile(path.join(root, rel), 'utf8'));
}

function rec(s) {
  const miss = s[4];
  const mp = s[3];
  const pos = s[14] || (mp > 0 ? Math.max(1, Math.round(miss * 100 / mp)) : 2);
  return { impact: s[0], miss, pos, stars: Math.round(s[1] * pos), net: s[5] };
}

function pageMetrics(S) {
  const wars = S.wars.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const P = {};
  const order = [];
  for (const w of wars) {
    for (const m of w.members) {
      let p = P[m[0]];
      if (!p) {
        p = P[m[0]] = { n: m[0], g: 0, pos: 0, stars: 0, miss: 0, net: 0, impSum: 0 };
        order.push(m[0]);
      }
      if (!m[2]) continue;
      const r = rec(m[2]);
      p.g++;
      p.pos += r.pos;
      p.stars += r.stars;
      p.miss += r.miss;
      p.net += r.net;
      p.impSum += r.impact;
    }
  }
  const by = {};
  for (const k of order) {
    const p = P[k];
    p.imp = p.g ? p.impSum / p.g : 0;
    by[k] = p;
  }
  const names = (S.roster || []).map((m) => m[0]);
  for (const k of order) if (!names.includes(k)) names.push(k);
  const don = {};
  let maxD = 1;
  for (const m of S.roster || []) {
    don[m[0]] = m[4];
    if (m[4] > maxD) maxD = m[4];
  }
  const top = names.map((n) => {
    const p = by[n];
    const ok = p && p.g;
    return { n, score: (ok ? p.imp : 0) * 0.7 + ((don[n] || 0) / maxD) * 30 };
  }).sort((a, b) => (b.score - a.score) || a.n.localeCompare(b.n, 'es'));

  const H = {};
  for (const w of wars) {
    for (const m of w.members) {
      if (!m[2]) continue;
      (H[m[0]] = H[m[0]] || []).push(rec(m[2]));
    }
  }
  const out = [];
  for (const n of Object.keys(H)) {
    const h = H[n];
    let pos = 0;
    let miss = 0;
    for (const r of h) { pos += r.pos; miss += r.miss; }
    if (miss >= 2 && miss * 2 >= pos) out.push({ n, miss, pos });
  }
  out.sort((a, b) => b.miss - a.miss);
  return {
    top: top.slice(0, 3).map((x) => [x.n, Math.round(x.score)]),
    out: out.map((x) => [x.n, x.miss, x.pos]),
  };
}

function byName(members) {
  const o = {};
  for (const m of members) {
    const stats = Array.isArray(m[2]) && m[2].length === 14 ? m[2].concat([2]) : m[2];
    o[m[0]] = [m[1], stats];
  }
  return o;
}

test('traduce ligas, frecuencia, tipo y distritos', () => {
  const { clan, roster } = fromApi({
    name: 'clandestinos',
    clanLevel: 5,
    tag: CLAN,
    warLeague: { name: 'Silver League II' },
    capitalLeague: { name: 'Unranked' },
    warFrequency: 'always',
    location: { name: 'International' },
    type: 'inviteOnly',
    labels: [{ name: 'Clan Wars' }],
    clanCapital: { capitalHallLevel: 2, districts: [{ name: 'Capital Peak', districtHallLevel: 2 }] },
    memberList: [{ name: 'Joshua', role: 'leader', townHallLevel: 18, expLevel: 1, donations: 0, donationsReceived: 0, builderBaseTrophies: 0 }],
  });
  assert.equal(clan.league, 'Plata II');
  assert.equal(clan.capLeague, 'Sin clasificar');
  assert.equal(clan.freq, 'Siempre');
  assert.equal(clan.location, 'Internacional');
  assert.equal(clan.join, 'Solo con invitación');
  assert.deepEqual(clan.labels, ['Guerras de Clanes']);
  assert.deepEqual(clan.districts, [['Pico de la Capital', 2, 10]]);
  assert.deepEqual(roster, [['Joshua', 'L', 18, 1, 0, 0, 0]]);
});

test('per es 1 en liga y 2 en guerra normal si la API no lo manda', () => {
  assert.equal(perOf({ attacksPerMember: 2 }), 2);
  assert.equal(perOf({ warTag: '#ABC' }), 1);
  assert.equal(perOf({}), 2);
});

test('nuevas estrellas respetan el orden y el empate se rompe por destrucción', () => {
  const war = {
    attacksPerMember: 2,
    startTime: '20261001T000000.000Z',
    clan: {
      tag: CLAN,
      name: 'clandestinos',
      stars: 3,
      destructionPercentage: 100,
      members: [
        {
          tag: '#A', name: 'A', mapPosition: 1, opponentAttacks: 0,
          attacks: [{ attackerTag: '#A', defenderTag: '#D', stars: 2, destructionPercentage: 80, order: 1 }],
        },
        {
          tag: '#B', name: 'B', mapPosition: 2, opponentAttacks: 1,
          bestOpponentAttack: { stars: 3 },
          attacks: [{ attackerTag: '#B', defenderTag: '#D', stars: 3, destructionPercentage: 100, order: 2 }],
        },
      ],
    },
    opponent: { tag: '#X', name: 'Rival', stars: 3, destructionPercentage: 50, members: [] },
  };
  const site = buildSite({
    clanJson: { name: 'x', tag: CLAN, memberList: [] },
    prospects: [],
    legacy: [],
    rawWars: [war],
    generatedAt: '2026-10-01T00:00:00Z',
    clanTag: CLAN,
  });
  const by = Object.fromEntries(site.wars[0].members.map((m) => [m[0], m[2]]));
  assert.deepEqual(by.A, [35, 1, 1, 50, 1, 2, 0, 50, 0, 0, 0, 0, 0, 0, 2]);
  assert.deepEqual(by.B, [50, 1.5, 0.5, 50, 1, -2, 50, 0, 0, 0, 100, 0, 0, 0, 2]);
  assert.equal(site.wars[0].res, 'V');
  const tied = {
    ...war,
    opponent: { ...war.opponent, destructionPercentage: 100 },
  };
  assert.equal(warResult(
    { stars: 3, destructionPercentage: 100 },
    { stars: 3, destructionPercentage: 100 },
  ), 'E');
  assert.equal(summarizeWar(tied, CLAN).res, 'E');
});

test('guerras de liga del 3 al 6 de octubre', async () => {
  const files = (await readdir(path.join(root, 'data/raw'))).filter((f) => f.endsWith('.json')).sort();
  const rows = [];
  for (const f of files) {
    const war = JSON.parse(await readFile(path.join(root, 'data/raw', f), 'utf8'));
    const s = summarizeWar(war, CLAN);
    rows.push({ date: s.date, rival: s.rival, res: s.res, stars: s.stars });
  }
  assert.deepEqual(rows, [
    { date: '2026-10-03', rival: 'MiniDuplonauten', res: 'V', stars: [36, 0] },
    { date: '2026-10-04', rival: 'ICE BLIZZARD', res: 'V', stars: [40, 12] },
    { date: '2026-10-05', rival: 'The BORO', res: 'D', stars: [24, 27] },
    { date: '2026-10-06', rival: 'EMPIRE', res: 'V', stars: [35, 15] },
  ]);
});

test('cinco guerras, top 3 y fuera de guerra', async () => {
  const approved = await readJson('tests/fixtures/approved-state.json');
  const clanJson = await readJson('data/clan.json');
  const prospects = await readJson('data/prospects.json');
  const legacy = await readJson('data/legacy-wars.json');
  const files = (await readdir(path.join(root, 'data/raw'))).filter((f) => f.endsWith('.json')).sort();
  const rawWars = [];
  for (const f of files) rawWars.push(JSON.parse(await readFile(path.join(root, 'data/raw', f), 'utf8')));
  const site = buildSite({
    clanJson, prospects, legacy, rawWars,
    generatedAt: '2026-10-09T00:00:00Z',
    clanTag: CLAN,
  });
  const again = buildSite({
    clanJson, prospects, legacy, rawWars,
    generatedAt: '2026-10-09T00:00:00Z',
    clanTag: CLAN,
  });
  assert.equal(site.wars.length, 5);
  assert.deepEqual(again.wars.map((w) => w.id), site.wars.map((w) => w.id));
  assert.deepEqual(fromApi(clanJson).clan, approved.clan);
  assert.deepEqual(fromApi(clanJson).roster, approved.roster);
  assert.deepEqual(site.prospects, approved.prospects);
  const approvedById = Object.fromEntries(approved.wars.map((w) => [w.id, w]));
  for (const w of site.wars) {
    const exp = approvedById[w.id];
    assert.ok(exp, w.id);
    assert.equal(w.date, exp.date);
    assert.equal(w.rival, exp.rival);
    assert.equal(w.res, exp.res);
    assert.deepEqual(byName(w.members), byName(exp.members));
  }
  assert.deepEqual(pageMetrics(site), {
    top: [['Abrasive7X', 80], ['kssto', 75], ['demiur', 74]],
    out: [['Joshua', 4, 6], ['ⓟⓐⓒⓜⓐⓝ', 3, 6], ['JOSHUA', 2, 2], ['jhon cna', 2, 4]],
  });
  assert.equal(site.wars.filter((w) => w.id === 'w1')[0].members.some((m) => m[0] === 'joshua'), true);
  assert.equal(site.wars.filter((w) => w.id === 'w1')[0].members.some((m) => m[0] === 'Joshua'), true);
  assert.equal(site.wars.filter((w) => w.id === 'w1')[0].members.some((m) => m[0] === 'JOSHUA'), true);
});
