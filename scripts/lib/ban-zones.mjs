import { warsSorted } from './site-metrics.mjs';

function rec(s) {
  const miss = s[4];
  const mp = s[3];
  const pos = s[14] || (mp > 0 ? Math.max(1, Math.round((miss * 100) / mp)) : 2);
  return { impact: s[0], miss, pos };
}

function isFuera(miss, pos) {
  return miss >= 2 && miss * 2 >= pos;
}

function trailingFullMiss(rows) {
  let n = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (!rows[i].full) break;
    n += 1;
  }
  return n;
}

/**
 * Zona roja: ≥2 guerras seguidas sin usar ningún ataque (o nunca atacó en ≥2 guerras).
 * Zona gris: fuera de guerra o 1 guerra reciente sin atacar, sin llegar a roja.
 */
export function banZones(wars, roster = []) {
  const don = {};
  for (const m of roster || []) don[m[0]] = m[4] || 0;

  const by = new Map();
  for (const w of warsSorted(wars)) {
    for (const m of w.members || []) {
      if (!m[2]) continue;
      const r = rec(m[2]);
      let p = by.get(m[0]);
      if (!p) {
        p = { n: m[0], g: 0, miss: 0, pos: 0, impSum: 0, rows: [] };
        by.set(m[0], p);
      }
      p.g += 1;
      p.miss += r.miss;
      p.pos += r.pos;
      p.impSum += r.impact;
      p.rows.push({
        date: w.date,
        miss: r.miss,
        pos: r.pos,
        full: r.pos > 0 && r.miss === r.pos,
      });
    }
  }

  const red = [];
  const grey = [];
  for (const p of by.values()) {
    const streak = trailingFullMiss(p.rows);
    const neverHit = p.g >= 2 && p.miss === p.pos && p.pos > 0;
    const lastFull = p.rows.length ? p.rows[p.rows.length - 1].full : false;
    const fuera = isFuera(p.miss, p.pos);
    const row = {
      n: p.n,
      g: p.g,
      miss: p.miss,
      pos: p.pos,
      streak,
      don: don[p.n] || 0,
      imp: p.g ? Math.round(p.impSum / p.g) : 0,
      lastFull,
      fuera,
    };
    if (streak >= 2 || neverHit) red.push(row);
    else if (fuera || lastFull || streak === 1) grey.push(row);
  }

  const cmp = (a, b) => (b.streak - a.streak) || (b.miss - a.miss) || a.n.localeCompare(b.n, 'es');
  red.sort(cmp);
  grey.sort(cmp);
  return { red, grey };
}

const COLOR = { warn: 0xffc83d, red: 0xe74c3c, grey: 0x95a5a6 };

function clip(text, max = 1024) {
  const s = String(text || '');
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function lines(rows, empty) {
  if (!rows.length) return empty;
  return rows.map((x) => {
    const why = x.streak >= 2
      ? `${x.streak} seguidas sin atacar`
      : x.miss === x.pos
        ? `${x.miss}/${x.pos} sin usar (nunca atacó)`
        : `${x.miss}/${x.pos} sin usar`;
    return `• **${x.n}** · \`${why}\``;
  }).join('\n');
}

export function buildBanZonesPayload(site) {
  const zones = banZones(site.wars || [], site.roster || []);
  const clan = site.clan?.name || 'clandestinos';
  return {
    zones,
    payload: {
      username: 'clandestinos.ops',
      embeds: [
        {
          title: '⚠️ Aviso · zonas de ban',
          description: [
            'Regla del clan (ataques en guerra):',
            '• **1 guerra** sin atacar → **aviso** (zona gris)',
            '• **2 guerras seguidas** sin atacar → **zona roja** (kick / ban)',
            '',
            '_La decisión final es de los líderes. Esto es una sugerencia automática._',
          ].join('\n'),
          color: COLOR.warn,
          fields: [
            {
              name: `🔴 Zona roja · ${zones.red.length}`,
              value: clip(lines(zones.red, '_Nadie en zona roja._')),
              inline: false,
            },
            {
              name: `⚪ Zona gris · ${zones.grey.length}`,
              value: clip(lines(zones.grey, '_Nadie en zona gris._')),
              inline: false,
            },
          ],
          timestamp: new Date().toISOString(),
          footer: { text: `${clan} · Aviso de disciplina` },
        },
      ],
    },
  };
}

export async function runDiscordBanZones({
  site,
  webhookUrl,
  force = false,
  fetchImpl = fetch,
  log = console.log,
}) {
  const { zones, payload } = buildBanZonesPayload(site);
  if (!force) {
    log(`Ban zones: roja=${zones.red.length} gris=${zones.grey.length} (sin enviar).`);
    return { posted: false, reason: 'idle', zones };
  }
  if (!webhookUrl) {
    log('Discord ban zones: falta DISCORD_WEBHOOK_URL.');
    return { posted: false, reason: 'no-webhook', zones };
  }
  const res = await fetchImpl(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    log(`Discord ban zones: webhook ${res.status}.`);
    return { posted: false, reason: 'http', status: res.status, zones };
  }
  log(`Discord ban zones: aviso enviado (roja ${zones.red.length}, gris ${zones.grey.length}).`);
  return { posted: true, reason: 'force', zones };
}
