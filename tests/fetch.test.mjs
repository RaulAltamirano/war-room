import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, writeFile, mkdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { run } from '../scripts/fetch.mjs';

const CLAN = '#2RGC02RYC';

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

test('un token inválido avisa y no toca data/', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bitacora-'));
  await mkdir(path.join(root, 'data', 'raw'), { recursive: true });
  const marker = path.join(root, 'data', 'raw', 'keep.json');
  await writeFile(marker, '{"ok":true}\n');
  const before = await stat(marker);
  const logs = [];
  const result = await run({
    root,
    token: 'token-invalido',
    clanTag: CLAN,
    log: (m) => logs.push(String(m)),
    sleep: async () => {},
    fetchImpl: async () => json(403, { reason: 'accessDenied' }),
  });
  assert.equal(result.ok, false);
  const text = logs.join('\n');
  assert.match(text, /403/);
  assert.match(text, /45\.79\.218\.79/);
  assert.match(text, /No se modificaron los datos/);
  assert.equal(await readFile(marker, 'utf8'), '{"ok":true}\n');
  assert.equal((await stat(marker)).mtimeMs, before.mtimeMs);
  assert.equal((await readdir(path.join(root, 'data'))).includes('clan.json'), false);
});

test('404 de liga es normal, guarda la guerra terminada y no la duplica', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bitacora-'));
  const war = {
    state: 'warEnded',
    attacksPerMember: 2,
    startTime: '20261008T120000.000Z',
    clan: { tag: CLAN, name: 'clandestinos', stars: 10, destructionPercentage: 50, members: [] },
    opponent: { tag: '#AAAA', name: 'Rival', stars: 8, destructionPercentage: 40, members: [] },
  };
  let leagueHits = 0;
  const logs = [];
  const fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes('/currentwar/leaguegroup')) {
      leagueHits++;
      return json(404, { reason: 'notFound' });
    }
    if (u.endsWith('/currentwar')) return json(200, war);
    if (u.includes('/clans/')) return json(200, { tag: CLAN, name: 'clandestinos', badgeUrls: { small: 'x' }, memberList: [] });
    return json(500, {});
  };
  const opts = { root, token: 't', clanTag: CLAN, log: (m) => logs.push(String(m)), sleep: async () => {}, fetchImpl };
  const first = await run(opts);
  const second = await run(opts);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(leagueHits, 2);
  assert.equal(first.saved.includes('20261008-AAAA.json'), true);
  assert.equal(second.saved.length, 0);
  assert.equal(second.skipped.includes('20261008-AAAA.json'), true);
  const raw = JSON.parse(await readFile(path.join(root, 'data/raw/20261008-AAAA.json'), 'utf8'));
  assert.equal(raw.state, 'warEnded');
  const clan = JSON.parse(await readFile(path.join(root, 'data/clan.json'), 'utf8'));
  assert.equal(clan.badgeUrls.small, 'x');
  assert.equal(logs.some((l) => /404/.test(l) && /liga/i.test(l)), true);
});
