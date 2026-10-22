import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLAN_TAG, pickSides, rawFileName, stripImages } from './lib/normalize.mjs';
import { snapshotActiveWar } from './lib/war-scout.mjs';

const rootDefault = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function enc(tag) {
  return encodeURIComponent(tag);
}

async function request(fetchImpl, url, { token, allow404, sleep, log }) {
  let last = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    let res;
    try {
      res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    } catch (err) {
      last = 0;
      if (attempt === 0) {
        log(`Error de red. Reintento. ${err.message || ''}`.trim());
        await sleep(2000 + Math.floor(Math.random() * 3001));
        continue;
      }
      log(`No se pudo contactar la API. No se modificaron los datos.`);
      return { ok: false, status: 0, json: null };
    }
    last = res.status;
    if (res.status === 404 && allow404) return { ok: true, status: 404, json: null };
    if (res.status === 403) {
      log('403: token inválido o IP no autorizada. La llave debe permitir la IP 45.79.218.79. No se modificaron los datos.');
      return { ok: false, status: 403, json: null };
    }
    if (res.status === 429 && attempt === 0) {
      log('429: límite de la API. Reintento una vez.');
      await sleep(2000);
      continue;
    }
    if (res.status >= 500 && attempt === 0) {
      log(`${res.status}: error del servidor. Reintento una vez.`);
      await sleep(2000 + Math.floor(Math.random() * 3001));
      continue;
    }
    if (!res.ok) {
      log(`Error ${res.status} al consultar la API. No se modificaron los datos.`);
      return { ok: false, status: res.status, json: null };
    }
    return { ok: true, status: res.status, json: await res.json() };
  }
  log(`Error ${last || 429} al consultar la API. No se modificaron los datos.`);
  return { ok: false, status: last || 429, json: null };
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

export async function run(opts = {}) {
  const log = opts.log || ((m) => console.error(m));
  const sleep = opts.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const fetchImpl = opts.fetchImpl || fetch;
  const token = opts.token ?? process.env.COC_API_TOKEN;
  const clanTag = opts.clanTag || process.env.CLAN_TAG || CLAN_TAG;
  const base = opts.base || 'https://cocproxy.royaleapi.dev/v1';
  const dir = opts.root || rootDefault;
  if (!token) {
    log('Falta COC_API_TOKEN. No se modificaron los datos.');
    return { ok: false, saved: [], skipped: [] };
  }
  const get = (url, extra) => request(fetchImpl, url, { token, sleep, log, ...extra });
  const clanRes = await get(`${base}/clans/${enc(clanTag)}`);
  if (!clanRes.ok) return { ok: false, saved: [], skipped: [] };
  const currentRes = await get(`${base}/clans/${enc(clanTag)}/currentwar`);
  if (!currentRes.ok) return { ok: false, saved: [], skipped: [] };
  const leagueRes = await get(`${base}/clans/${enc(clanTag)}/currentwar/leaguegroup`, { allow404: true });
  if (!leagueRes.ok) return { ok: false, saved: [], skipped: [] };
  if (leagueRes.status === 404) log('404 en la liga de guerras: no hay temporada activa. Se sigue con el resto.');

  const pending = [];
  if (currentRes.json?.state === 'warEnded' && pickSides(currentRes.json, clanTag)) pending.push(currentRes.json);
  const rounds = leagueRes.json?.rounds || [];
  for (const round of rounds) {
    for (const warTag of round.warTags || []) {
      if (!warTag || warTag === '#0') continue;
      const warRes = await get(`${base}/clanwarleagues/wars/${enc(warTag)}`);
      if (warRes.status === 404) {
        log(`404 en la guerra de liga ${warTag}. Se omite.`);
        continue;
      }
      if (!warRes.ok) return { ok: false, saved: [], skipped: [] };
      if (warRes.json?.state !== 'warEnded') continue;
      if (!pickSides(warRes.json, clanTag)) continue;
      pending.push({ ...warRes.json, warTag: warRes.json.warTag || warTag });
    }
  }

  await mkdir(path.join(dir, 'data', 'raw'), { recursive: true });
  await writeFile(path.join(dir, 'data/clan.json'), JSON.stringify(stripImages(clanRes.json, { keepBadge: true }), null, 2) + '\n');
  const activeWar = snapshotActiveWar(currentRes.json, clanTag, { pickSides });
  await writeFile(path.join(dir, 'data/active-war.json'), `${JSON.stringify(activeWar, null, 2)}\n`);
  if (activeWar.state === 'preparation' || activeWar.state === 'inWar') {
    log(`Guerra activa (${activeWar.state}) vs ${activeWar.rival || '?'}: scout snapshot guardado.`);
  } else {
    log('Sin guerra en preparación/batalla: scout snapshot en notInWar.');
  }
  const saved = [];
  const skipped = [];
  for (const war of pending) {
    const name = rawFileName(war, clanTag);
    if (!name) continue;
    const dest = path.join(dir, 'data/raw', name);
    if (await exists(dest)) {
      skipped.push(name);
      log(`Ya existe ${name}. No se vuelve a escribir.`);
      continue;
    }
    await writeFile(dest, JSON.stringify(war, null, 2) + '\n');
    saved.push(name);
    log(`Guardada ${name}.`);
  }
  await writeFile(
    path.join(dir, 'data/last-fetch.json'),
    `${JSON.stringify({ at: new Date().toISOString(), saved, skipped }, null, 2)}\n`,
  );
  return { ok: true, saved, skipped };
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === self) {
  run().then((r) => {
    if (!r.ok) process.exit(1);
  }).catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
