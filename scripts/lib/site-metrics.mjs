function rec(s) {
  const miss = s[4];
  const mp = s[3];
  const pos = s[14] || (mp > 0 ? Math.max(1, Math.round((miss * 100) / mp)) : 2);
  return { impact: s[0], miss, pos, stars: Math.round(s[1] * pos), net: s[5] };
}

function cmpOff(x, y) {
  return (y.imp - x.imp) || (y.stars - x.stars) || (y.net - x.net) || (x.miss - y.miss) || x.n.localeCompare(y.n, 'es');
}

export function warsSorted(wars) {
  return (wars || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

/** Liga de clanes (CWL) pesa el doble en el promedio de impacto. */
export const LIGA_WEIGHT = 2;

export function scoredList(wars, roster) {
  const P = {};
  const order = [];
  for (const w of warsSorted(wars)) {
    const weight = w.liga ? LIGA_WEIGHT : 1;
    for (const m of w.members || []) {
      let p = P[m[0]];
      if (!p) {
        p = P[m[0]] = { n: m[0], g: 0, pos: 0, stars: 0, miss: 0, net: 0, impSum: 0, wSum: 0 };
        order.push(m[0]);
      }
      if (!m[2]) continue;
      const r = rec(m[2]);
      p.g += 1;
      p.pos += r.pos;
      p.stars += r.stars;
      p.miss += r.miss;
      p.net += r.net;
      p.impSum += r.impact * weight;
      p.wSum += weight;
    }
  }
  const don = {};
  for (const m of roster || []) don[m[0]] = m[4] || 0;
  const list = order.map((k) => {
    const p = P[k];
    p.imp = p.wSum ? p.impSum / p.wSum : 0;
    p.don = don[k] || 0;
    return p;
  }).filter((p) => p.g);
  let maxDon = 0;
  for (const p of list) if ((p.don || 0) > maxDon) maxDon = p.don;
  for (const p of list) {
    p.score = 0.7 * p.imp + 0.3 * (maxDon ? (p.don / maxDon) * 100 : 0);
  }
  list.sort((a, b) => (b.score - a.score) || cmpOff(a, b) || a.n.localeCompare(b.n, 'es'));
  return list;
}

export function trendOf(wars) {
  const H = {};
  for (const w of warsSorted(wars)) {
    for (const m of w.members || []) {
      if (!m[2]) continue;
      (H[m[0]] = H[m[0]] || []).push(rec(m[2]));
    }
  }
  const up = [];
  const down = [];
  const out = [];
  for (const n of Object.keys(H)) {
    const h = H[n];
    let pos = 0;
    let miss = 0;
    for (const r of h) {
      pos += r.pos;
      miss += r.miss;
    }
    if (miss >= 2 && miss * 2 >= pos) {
      out.push({ n, miss, pos });
      continue;
    }
    if (h.length < 2) continue;
    const k = Math.min(2, h.length - 1);
    const recent = h.slice(-k);
    const prev = h.slice(0, h.length - k);
    const avg = (a) => a.reduce((t, r) => t + r.impact, 0) / a.length;
    const a0 = avg(prev);
    const a1 = avg(recent);
    const d = Math.round(a1 - a0);
    if (d >= 10) up.push({ n, d, from: Math.round(a0), to: Math.round(a1) });
    else if (d <= -10) down.push({ n, d, from: Math.round(a0), to: Math.round(a1) });
  }
  up.sort((a, b) => b.d - a.d);
  down.sort((a, b) => a.d - b.d);
  out.sort((a, b) => b.miss - a.miss);
  return { up, down, out };
}

export function warSignature(wars) {
  return warsSorted(wars).map((w) => w.id).filter(Boolean).join('|');
}

export function buildBriefing(site) {
  const wars = site.wars || [];
  const scored = scoredList(wars, site.roster || []);
  const trend = trendOf(wars);
  const outNames = new Set(trend.out.map((x) => x.n));
  const prospects = scored.filter((p) => !outNames.has(p.n));
  const top3 = scored.slice(0, 3).map((p) => ({
    n: p.n,
    score: Math.round(p.score),
    imp: Math.round(p.imp),
    stars: p.stars,
    don: p.don,
    miss: p.miss,
    g: p.g,
  }));
  const last = warsSorted(wars).slice(-1)[0] || null;
  return {
    clan: site.clan || {},
    top3,
    trend,
    prospects: prospects.map((p, i) => ({
      rank: i + 1,
      n: p.n,
      score: Math.round(p.score),
      miss: p.miss,
    })),
    last,
    warsCount: wars.length,
    signature: warSignature(wars),
  };
}
