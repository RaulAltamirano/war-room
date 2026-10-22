import { clipLines } from './discord-text.mjs';

const RES = { V: 'Victoria', D: 'Derrota', E: 'Empate' };
const LTR = '\u200E';
const FSI = '\u2068';
const PDI = '\u2069';
const COLOR = 0x9b2c3c;

function nameOf(n) {
  return `${FSI}${n}${PDI}`;
}

function fshort(date) {
  if (!date) return 'Sin fecha';
  const p = date.split('-');
  const m = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${+p[2]} ${m[+p[1] - 1]}`;
}

function savedToDate(name) {
  const base = String(name).replace(/\.json$/i, '');
  const day = base.slice(0, 8);
  if (!/^\d{8}$/.test(day)) return null;
  return `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`;
}

function savedToRivalTag(name) {
  const base = String(name).replace(/\.json$/i, '');
  const dash = base.indexOf('-');
  if (dash < 8) return null;
  const tag = base.slice(dash + 1);
  return tag || null;
}

function warRivalTagFromId(w) {
  const m = /^w\d{8}-(.+)$/.exec(w?.id || '');
  return m ? m[1] : null;
}

export function resolveWarsFromSaved(site, saved = []) {
  const wars = site?.wars || [];
  const out = [];
  for (const file of saved) {
    const date = savedToDate(file);
    if (!date) continue;
    const rivalTag = savedToRivalTag(file);
    const matches = wars.filter((w) => w.date === date);
    let picked = null;
    if (rivalTag && matches.length) {
      const byTag = matches.filter((w) => {
        const idTag = warRivalTagFromId(w);
        if (idTag && idTag.toUpperCase() === rivalTag.toUpperCase()) return true;
        const rt = String(w.rivalTag || '').replace(/^#/, '');
        return rt && rt.toUpperCase() === rivalTag.toUpperCase();
      });
      if (byTag.length === 1) picked = byTag[0];
      else if (byTag.length > 1) picked = byTag[byTag.length - 1];
    }
    if (!picked && matches.length) picked = matches[matches.length - 1];
    if (picked) out.push(picked);
  }
  return out;
}

export function topAttacks(war, limit = 3) {
  const rows = [];
  for (const m of war?.members || []) {
    for (const a of m[5] || []) {
      rows.push({ n: m[0], stars: a[0] || 0, destruction: a[1] || 0, order: a[2] || 0 });
    }
  }
  rows.sort((a, b) => (b.stars - a.stars) || (b.destruction - a.destruction) || (a.order - b.order));
  return rows.slice(0, limit);
}

function mvpBetter(row, best) {
  if (row.impact !== best.impact) return row.impact > best.impact;
  if (row.attackStars !== best.attackStars) return row.attackStars > best.attackStars;
  if (row.nuevas !== best.nuevas) return row.nuevas > best.nuevas;
  if (row.destruction !== best.destruction) return row.destruction > best.destruction;
  return row.n.localeCompare(best.n, 'es') < 0;
}

export function warMvp(war) {
  let best = null;
  for (const m of war?.members || []) {
    const attacks = m[5] || [];
    const row = {
      n: m[0],
      impact: m[2]?.[0] ?? -1,
      attackStars: attacks.reduce((s, a) => s + (a[0] || 0), 0),
      nuevas: m[2]?.[2] ?? -1,
      destruction: attacks.reduce((s, a) => s + (a[1] || 0), 0),
    };
    if (!best || mvpBetter(row, best)) best = row;
  }
  return best;
}

export function didNotAttack(war) {
  return (war?.members || [])
    .filter((m) => {
      const pos = m[2]?.[14] || 0;
      const unused = m[2]?.[4] || 0;
      return pos > 0 && unused === pos;
    })
    .map((m) => m[0]);
}

function starsGlyph(n) {
  return '★'.repeat(Math.max(0, Math.min(3, n))) + '☆'.repeat(Math.max(0, 3 - n));
}

export function buildWarHighlightPayload(war, { clan } = {}) {
  const clanName = clan?.name || 'clandestinos';
  const mvp = warMvp(war);
  const attacks = topAttacks(war, 3);
  const skipped = didNotAttack(war);
  const res = RES[war?.res] || war?.res || '—';
  const score = (war?.stars || [0, 0]).join('-');

  const attackLines = attacks.map((a, i) => `${LTR}${i + 1}. **${nameOf(a.n)}** · ${starsGlyph(a.stars)} ${a.destruction}%`);
  const skipLines = skipped.map((n) => `${LTR}• **${nameOf(n)}**`);

  const embed = {
    title: `⚔️ Guerra terminada · ${clanName}`,
    description: [
      `**${fshort(war?.date)}** vs **${war?.rival || '—'}** · ${res} · ${score}`,
      '',
      mvp
        ? `**MVP:** ${LTR}**${nameOf(mvp.n)}** · impacto \`${mvp.impact}\``
        : '**MVP:** _Sin datos_',
    ].join('\n'),
    color: COLOR,
    fields: [
      {
        name: '⚔️ Mejores ataques',
        value: attackLines.length ? clipLines(attackLines) : '_Sin ataques._',
        inline: false,
      },
      {
        name: skipped.length ? `✕ No atacaron · ${skipped.length}` : '✕ No atacaron',
        value: skipLines.length ? clipLines(skipLines) : '_Todos atacaron._',
        inline: false,
      },
    ],
    timestamp: new Date().toISOString(),
    footer: { text: `${clanName} · Highlight de guerra` },
  };

  return {
    meta: { mvp, attacks, skipped },
    payload: { username: 'clandestinos.ops', embeds: [embed] },
  };
}
