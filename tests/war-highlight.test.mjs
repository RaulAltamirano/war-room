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

test('warMvp con impacto 100 desempata por estrellas, nuevas y destrucción', () => {
  const row = (name, nuevas, attacks) => {
    const s = [100, 0, nuevas, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2];
    return [name, 'M', s, 15, 1, attacks];
  };
  const byNuevas = warMvp({
    members: [
      row('Zed', 1, [[3, 100, 1]]),
      row('Ann', 2, [[3, 100, 2]]),
    ],
  });
  assert.equal(byNuevas.n, 'Ann');
  const byDestruction = warMvp({
    members: [
      row('Zed', 1, [[3, 80, 1], [3, 80, 2]]),
      row('Ann', 1, [[3, 100, 3], [3, 70, 4]]),
    ],
  });
  assert.equal(byDestruction.n, 'Ann');
  assert.equal(byDestruction.destruction, 170);
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

test('resolveWarsFromSaved usa rivalTag aunque el id de la primera guerra no lleve tag', () => {
  const sameDay = [
    { ...war, id: 'w20261013', rival: 'FIRST', rivalTag: 'AAAA', members: [] },
    { ...war, id: 'w20261013-BBBB', rival: 'SECOND', rivalTag: 'BBBB' },
  ];
  const rows = resolveWarsFromSaved({ wars: sameDay }, ['20261013-AAAA.json']);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].rival, 'FIRST');
});

test('no atacaron cabe en un campo de Discord', () => {
  const members = Array.from({ length: 70 }, (_, i) => mem(`NombreLargo${String(i).padStart(4, '0')}`, 0, 2, 2, []));
  const { payload } = buildWarHighlightPayload({ ...war, members }, { clan: { name: 'c' } });
  const field = payload.embeds[0].fields.find((f) => /No atacaron/.test(f.name));
  assert.ok(field.value.length <= 1024);
  assert.match(field.value, /más/);
  assert.match(field.value, /NombreLargo0000/);
  assert.equal(field.value.includes('NombreLargo0069'), false);
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
