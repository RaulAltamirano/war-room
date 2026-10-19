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

export function resolveWarsFromSaved(site, saved = []) {
  const wars = site?.wars || [];
  const out = [];
  for (const file of saved) {
    const date = savedToDate(file);
    if (!date) continue;
    const matches = wars.filter((w) => w.date === date);
    out.push(matches.length ? matches[matches.length - 1] : null);
  }
  return out.filter(Boolean);
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

export function warMvp(war) {
  let best = null;
  for (const m of war?.members || []) {
    const impact = m[2]?.[0] ?? -1;
    const attackStars = (m[5] || []).reduce((s, a) => s + (a[0] || 0), 0);
    const row = { n: m[0], impact, attackStars };
    if (!best
      || row.impact > best.impact
      || (row.impact === best.impact && row.attackStars > best.attackStars)
      || (row.impact === best.impact && row.attackStars === best.attackStars && row.n.localeCompare(best.n, 'es') < 0)) {
      best = row;
    }
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

  const attackLines = attacks.length
    ? attacks.map((a, i) => `${LTR}${i + 1}. **${nameOf(a.n)}** · ${starsGlyph(a.stars)} ${a.destruction}%`)
    : ['_Sin ataques._'];
  const skipLines = skipped.length
    ? skipped.map((n) => `${LTR}• **${nameOf(n)}**`)
    : ['_Todos atacaron._'];

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
        value: attackLines.join('\n'),
        inline: false,
      },
      {
        name: skipped.length ? `✕ No atacaron · ${skipped.length}` : '✕ No atacaron',
        value: skipLines.join('\n'),
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
