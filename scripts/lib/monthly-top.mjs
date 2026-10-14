const TZ = 'America/Mexico_City';

function rec(s) {
  const miss = s[4];
  const mp = s[3];
  const pos = s[14] || (mp > 0 ? Math.max(1, Math.round((miss * 100) / mp)) : 2);
  return { impact: s[0], miss, pos, stars: Math.round(s[1] * pos), net: s[5] };
}

function cmpOff(x, y) {
  return (y.imp - x.imp) || (y.stars - x.stars) || (y.net - x.net) || (x.miss - y.miss) || x.n.localeCompare(y.n, 'es');
}

export function monthKeyInZone(date = new Date(), timeZone = TZ) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit' })
      .formatToParts(date)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}`;
}

export function closedMonthKey(now = new Date(), timeZone = TZ) {
  const [y, m] = monthKeyInZone(now, timeZone).split('-').map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return `${py}-${String(pm).padStart(2, '0')}`;
}

export function warsInMonth(wars, monthKey) {
  return (wars || []).filter((w) => (w.date || '').startsWith(monthKey));
}

export function scoreMonth(wars, roster) {
  const P = {};
  const order = [];
  for (const w of wars || []) {
    for (const m of w.members || []) {
      let p = P[m[0]];
      if (!p) {
        p = P[m[0]] = { n: m[0], g: 0, pos: 0, stars: 0, miss: 0, net: 0, impSum: 0 };
        order.push(m[0]);
      }
      if (!m[2]) continue;
      const r = rec(m[2]);
      p.g += 1;
      p.pos += r.pos;
      p.stars += r.stars;
      p.miss += r.miss;
      p.net += r.net;
      p.impSum += r.impact;
    }
  }
  const don = {};
  for (const m of roster || []) don[m[0]] = m[4] || 0;
  const list = order.map((k) => {
    const p = P[k];
    p.imp = p.g ? p.impSum / p.g : 0;
    p.don = don[k] || 0;
    return p;
  }).filter((p) => p.g);
  let maxDon = 0;
  for (const p of list) if ((p.don || 0) > maxDon) maxDon = p.don;
  for (const p of list) p.score = 0.7 * p.imp + 0.3 * (maxDon ? (p.don / maxDon) * 100 : 0);
  list.sort((a, b) => (b.score - a.score) || cmpOff(a, b) || a.n.localeCompare(b.n, 'es'));
  const top3 = list.slice(0, 3).map((x) => [x.n, Math.round(x.score)]);
  if (!top3.length) return null;
  return { winner: top3[0][0], score: top3[0][1], top3 };
}

export function shouldPost(awards, monthKey) {
  return !awards || !awards[monthKey];
}

export function monthLabelEs(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const name = new Intl.DateTimeFormat('es-MX', { month: 'long' }).format(new Date(y, m - 1, 1));
  return `${name} ${y}`;
}

export function discordContent(result, monthKey) {
  const label = monthLabelEs(monthKey);
  const lines = [
    `🏆 **Top 1 ${label}: ${result.winner}** (${result.score} pts) — se gana el pase del mes.`,
  ];
  if (result.top3 && result.top3.length > 1) {
    lines.push(result.top3.map(([n, s], i) => `${i + 1}. ${n} — ${s}`).join('\n'));
  }
  return lines.join('\n');
}
