import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildWarHighlightPayload,
  didNotAttack,
  resolveWarsFromSaved,
  topAttacks,
  warMvp,
} from '../scripts/lib/war-highlight.mjs';

function mem(name, impact, unused, pos, attacks) {
  const mp = pos ? Math.round((unused * 100) / pos) : 0;
  const s = [impact, 0, 0, mp, unused, 0, 0, 0, 0, 0, 0, 0, 0, 0, pos];
  return [name, 'M', s, 15, 1, attacks || []];
}

const war = {
  id: 'w20261013',
  date: '2026-10-13',
  rival: 'SAVAGE FOUR',
  res: 'V',
  stars: [54, 0],
  members: [
    mem('Alpha', 100, 0, 2, [[3, 100, 1], [3, 98, 2]]),
    mem('Beta', 80, 0, 2, [[2, 90, 3]]),
    mem('Gamma', 10, 2, 2, []),
    mem('اوراس', 50, 0, 1, [[3, 99, 4]]),
  ],
};

test('topAttacks ordena estrellas ↓ destrucción ↓', () => {
  const t = topAttacks(war, 3);
  assert.equal(t.length, 3);
  assert.equal(t[0].n, 'Alpha');
  assert.equal(t[0].stars, 3);
  assert.equal(t[0].destruction, 100);
  assert.equal(t[1].n, 'اوراس');
  assert.equal(t[1].destruction, 99);
});

test('warMvp es el de mayor impacto', () => {
  const m = warMvp(war);
  assert.equal(m.n, 'Alpha');
  assert.equal(m.impact, 100);
});

test('didNotAttack lista unused===pos', () => {
  assert.deepEqual(didNotAttack(war), ['Gamma']);
});

test('resolveWarsFromSaved mapea YYYYMMDD-tag a date', () => {
  const site = { wars: [war, { ...war, id: 'w20261011', date: '2026-10-11', rival: 'OTHER' }] };
  const rows = resolveWarsFromSaved(site, ['20261013-AAAA.json']);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].date, '2026-10-13');
});

test('resolveWarsFromSaved distingue rivales el mismo día por tag en filename', () => {
  const sameDay = [
    { ...war, id: 'w20261013-BBBB', rival: 'OTHER CLAN', members: [] },
    { ...war, id: 'w20261013-AAAA', rival: 'SAVAGE FOUR' },
  ];
  const site = { wars: sameDay };
  const rows = resolveWarsFromSaved(site, ['20261013-BBBB.json']);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].rival, 'OTHER CLAN');
});

test('buildWarHighlightPayload un embed con RTL', () => {
  const { payload } = buildWarHighlightPayload(war, { clan: { name: 'clandestinos' } });
  assert.equal(payload.username, 'clandestinos.ops');
  assert.equal(payload.embeds.length, 1);
  assert.match(payload.embeds[0].title, /Guerra terminada/);
  const text = JSON.stringify(payload.embeds[0]);
  assert.match(text, /MVP/);
  assert.match(text, /Top 3 ataques|Mejores ataques/);
  assert.match(text, /Gamma/);
  assert.ok(text.includes('\u200E'));
  assert.ok(text.includes('\u2068'));
});
