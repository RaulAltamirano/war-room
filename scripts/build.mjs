import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSite } from './lib/normalize.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function build(opts = {}) {
  const dir = opts.root || root;
  const clanJson = JSON.parse(await readFile(path.join(dir, 'data/clan.json'), 'utf8'));
  const rawDir = path.join(dir, 'data/raw');
  const names = (await readdir(rawDir)).filter((n) => n.endsWith('.json')).sort();
  const rawWars = [];
  for (const name of names) {
    rawWars.push(JSON.parse(await readFile(path.join(rawDir, name), 'utf8')));
  }
  let activeWar = null;
  try {
    activeWar = JSON.parse(await readFile(path.join(dir, 'data/active-war.json'), 'utf8'));
  } catch {
    activeWar = { state: 'notInWar' };
  }
  const generatedAt = opts.generatedAt || new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const site = buildSite({
    clanJson,
    rawWars,
    generatedAt,
    clanTag: opts.clanTag || process.env.CLAN_TAG || '#2RGC02RYC',
    activeWar,
  });
  await writeFile(path.join(dir, 'data/site.json'), JSON.stringify(site, null, 2) + '\n');
  return site;
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === self) {
  build().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
