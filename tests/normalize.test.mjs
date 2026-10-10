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

function cmpOff(x, y) {
  return (y.imp - x.imp) || (y.stars - x.stars) || (y.net - x.net) || (x.miss - y.miss) || x.n.localeCompare(y.n, 'es');
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
  const don = {};
  for (const m of S.roster || []) don[m[0]] = m[4];
  const top = order.map((k) => {
    const p = P[k];
    p.imp = p.g ? p.impSum / p.g : 0;
    p.don = don[k] || 0;
    return p;
  }).filter((p) => p.g);
  let maxDon = 0;
  for (const p of top) if ((p.don || 0) > maxDon) maxDon = p.don;
  for (const p of top) p.score = 0.7 * p.imp + 0.3 * (maxDon ? (p.don / maxDon) * 100 : 0);
  top.sort((a, b) => (b.score - a.score) || cmpOff(a, b) || a.n.localeCompare(b.n, 'es'));

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
  const outNames = new Set(out.map((x) => x.n));
  return {
    top: top.slice(0, 3).map((x) => [x.n, Math.round(x.score)]),
    out: out.map((x) => [x.n, x.miss, x.pos]),
    pros: top.filter((p) => !outNames.has(p.n)).map((p) => p.n),
  };
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
          tag: '#A', name: 'A', mapPosition: 1, townhallLevel: 12, opponentAttacks: 0,
          attacks: [{ attackerTag: '#A', defenderTag: '#D', stars: 2, destructionPercentage: 80, order: 1 }],
        },
        {
          tag: '#B', name: 'B', mapPosition: 2, townhallLevel: 11, opponentAttacks: 1,
          bestOpponentAttack: { stars: 3 },
          attacks: [{ attackerTag: '#B', defenderTag: '#D', stars: 3, destructionPercentage: 100, order: 2 }],
        },
      ],
    },
    opponent: { tag: '#X', name: 'Rival', stars: 3, destructionPercentage: 50, members: [] },
  };
  const site = buildSite({
    clanJson: { name: 'x', tag: CLAN, memberList: [] },
    rawWars: [war],
    generatedAt: '2026-10-01T00:00:00Z',
    clanTag: CLAN,
  });
  const by = Object.fromEntries(site.wars[0].members.map((m) => [m[0], m[2]]));
  assert.deepEqual(by.A, [35, 1, 1, 50, 1, 2, 0, 50, 0, 0, 0, 0, 0, 0, 2]);
  assert.deepEqual(by.B, [50, 1.5, 0.5, 50, 1, -2, 50, 0, 0, 0, 100, 0, 0, 0, 2]);
  assert.equal(site.wars[0].res, 'V');
  const rowA = site.wars[0].members.find((m) => m[0] === 'A');
  assert.equal(rowA[3], 12);
  assert.equal(rowA[4], 1);
  assert.deepEqual(rowA[5], [[2, 80, 1]]);
  assert.equal(warResult(
    { stars: 3, destructionPercentage: 100 },
    { stars: 3, destructionPercentage: 100 },
  ), 'E');
  assert.equal(summarizeWar({
    ...war,
    opponent: { ...war.opponent, destructionPercentage: 100 },
  }, CLAN).res, 'E');
});

test('guerras de liga desde raw/', async () => {
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
    { date: '2026-10-07', rival: 'Sarıyer', res: 'V', stars: [33, 8] },
    { date: '2026-10-08', rival: 'ایرانیان', res: 'V', stars: [34, 23] },
  ]);
});

test('solo API: top 3, fuera de guerra y prospectos', async () => {
  const clanJson = await readJson('data/clan.json');
  const files = (await readdir(path.join(root, 'data/raw'))).filter((f) => f.endsWith('.json')).sort();
  const rawWars = [];
  for (const f of files) rawWars.push(JSON.parse(await readFile(path.join(root, 'data/raw', f), 'utf8')));
  const site = buildSite({
    clanJson, rawWars,
    generatedAt: '2026-10-09T00:00:00Z',
    clanTag: CLAN,
  });
  assert.equal(site.wars.length, 6);
  assert.equal(site.wars.some((w) => w.id === 'w1' || w.date === '2026-10-01'), false);
  assert.equal('prospects' in site, false);
  const m = pageMetrics(site);
  assert.deepEqual(m.top, [['kssto', 100], ['Pete Zahut', 81], ['demiur', 71]]);
  assert.deepEqual(m.out, [['Joshua', 4, 6], ['KOLET', 3, 6], ['jhon cna', 3, 6]]);
  assert.equal(m.pros[0], 'kssto');
  assert.equal(m.pros.includes('Joshua'), false);
  assert.equal(m.pros.includes('KOLET'), false);
  assert.ok(m.pros.length >= 10);
  const sample = site.wars[0].members.find((m) => Array.isArray(m[2]) && m[2][4] === 0);
  assert.ok(sample);
  assert.ok(sample[3] >= 9);
  assert.ok(sample[4] >= 1);
  assert.ok(Array.isArray(sample[5]));
  assert.ok(sample[5].length >= 1);
  assert.equal(sample[5][0].length, 3);
});
