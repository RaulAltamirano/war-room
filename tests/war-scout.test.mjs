import assert from 'node:assert/strict';
import test from 'node:test';
import { pickSides } from '../scripts/lib/normalize.mjs';
import { buildScoutPayload } from '../scripts/lib/discord-report.mjs';
import {
  armyForTh,
  buildScoutPlan,
  mirrorOk,
  pickActiveWarFromFetched,
  snapshotActiveWar,
} from '../scripts/lib/war-scout.mjs';

const CLAN = '#2RGC02RYC';

test('mirrorOk allows equal or +1 TH, rejects +2', () => {
  assert.equal(mirrorOk(15, 15).ok, true);
  assert.equal(mirrorOk(15, 14).ok, true);
  assert.equal(mirrorOk(15, 16).ok, true);
  assert.equal(mirrorOk(15, 17).ok, false);
});

test('armyForTh returns a labeled composition', () => {
  assert.match(armyForTh(16).label, /Root|Dragon/i);
  assert.ok(armyForTh(10).detail.length > 5);
});

test('snapshotActiveWar slim members in preparation', () => {
  const war = {
    state: 'preparation',
    teamSize: 2,
    attacksPerMember: 2,
    clan: {
      tag: CLAN,
      name: 'clandestinos',
      members: [
        { tag: '#A', name: 'Alice', townhallLevel: 15, mapPosition: 1 },
        { tag: '#B', name: 'Bob', townhallLevel: 14, mapPosition: 2 },
      ],
    },
    opponent: {
      tag: '#RIV',
      name: 'Rivales',
      members: [
        { tag: '#X', name: 'Xena', townhallLevel: 16, mapPosition: 1 },
        { tag: '#Y', name: 'Yuri', townhallLevel: 14, mapPosition: 2 },
      ],
    },
  };
  const snap = snapshotActiveWar(war, CLAN, { pickSides, at: '2026-10-22T12:00:00.000Z' });
  assert.equal(snap.state, 'preparation');
  assert.equal(snap.rival, 'Rivales');
  assert.equal(snap.us.length, 2);
  assert.equal(snap.them[0].th, 16);
});

test('buildScoutPlan prefers mirror when viable, else dips', () => {
  const activeWar = {
    state: 'inWar',
    teamSize: 2,
    rival: 'Rivales',
    us: [
      { tag: '#A', name: 'Alice', th: 15, pos: 1 },
      { tag: '#B', name: 'Bob', th: 14, pos: 2 },
    ],
    them: [
      { tag: '#X', name: 'Xena', th: 17, pos: 1 },
      { tag: '#Y', name: 'Yuri', th: 14, pos: 2 },
    ],
  };
  const { rows, summary } = buildScoutPlan(activeWar);
  assert.equal(rows.length, 2);
  // Alice (#1) can't mirror Xena TH17 → dips to Yuri TH14
  assert.equal(rows[0].mode, 'otro');
  assert.equal(rows[0].target.tag, '#Y');
  // Bob (#2) mirror Yuri already taken → only Xena left
  assert.equal(rows[1].mode, 'otro');
  assert.equal(rows[1].target.tag, '#X');
  assert.match(summary, /espejos/);
});

test('pickActiveWarFromFetched prefers CWL live when currentwar is idle', () => {
  const current = { state: 'notInWar' };
  const cwl = {
    state: 'inWar',
    teamSize: 15,
    attacksPerMember: 1,
    clan: {
      tag: CLAN,
      name: 'clandestinos',
      members: [{ tag: '#A', name: 'A', townhallLevel: 15, mapPosition: 1 }],
    },
    opponent: {
      tag: '#Z',
      name: 'CWL Rival',
      members: [{ tag: '#Z1', name: 'Z1', townhallLevel: 15, mapPosition: 1 }],
    },
  };
  const snap = pickActiveWarFromFetched(current, [cwl], CLAN, pickSides);
  assert.equal(snap.state, 'inWar');
  assert.equal(snap.source, 'cwl');
  assert.equal(snap.rival, 'CWL Rival');
});

test('buildScoutPayload embeds plan or empty state', () => {
  const empty = buildScoutPayload({ clan: { name: 'clandestinos' }, activeWar: { state: 'notInWar' } });
  assert.match(empty.payload.embeds[0].title, /sin guerra/i);

  const site = {
    clan: { name: 'clandestinos' },
    activeWar: {
      state: 'inWar',
      teamSize: 2,
      rival: 'Rivales',
      at: '2026-10-22T15:00:00.000Z',
      us: [
        { tag: '#A', name: 'Alice', th: 15, pos: 1 },
        { tag: '#B', name: 'Bob', th: 15, pos: 2 },
      ],
      them: [
        { tag: '#X', name: 'Xena', th: 15, pos: 1 },
        { tag: '#Y', name: 'Yuri', th: 15, pos: 2 },
      ],
    },
  };
  const { payload } = buildScoutPayload(site);
  assert.match(payload.embeds[0].title, /Scout.*Rivales/);
  assert.match(payload.embeds[0].description, /en batalla/);
  assert.ok(payload.embeds[0].fields.some((f) => /Plan|Ataques/i.test(f.name)));
  assert.ok(payload.embeds[0].fields.some((f) => /Ejércitos/i.test(f.name)));
  const body = payload.embeds[0].fields.map((f) => f.value).join('\n');
  assert.match(body, /Alice/);
  assert.match(body, /🪞/);
  assert.match(body, /↳/);
});
