const RES = { V: 'Victoria', D: 'Derrota', E: 'Empate' };

function fshort(date) {
  if (!date) return 'Sin fecha';
  const p = date.split('-');
  const m = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${+p[2]} ${m[+p[1] - 1]}`;
}

function impactOf(member) {
  const s = member[2];
  return s ? s[0] : 0;
}

export function formatWarDiscord(war) {
  const res = RES[war.res] || war.res || '—';
  const stars = war.stars || [0, 0];
  const emoji = war.res === 'V' ? '🟢' : war.res === 'D' ? '🔴' : '🟡';
  const lines = [
    `${emoji} **Guerra terminada — ${fshort(war.date)}**`,
    `Rival: **${war.rival || '—'}**`,
    `Resultado: **${res}**`,
    `Estrellas: **${stars[0]} — ${stars[1]}**`,
  ];
  const ranked = (war.members || [])
    .filter((m) => m[2])
    .map((m) => [m[0], impactOf(m)])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
    .slice(0, 3);
  if (ranked.length) {
    lines.push(`Top impacto: ${ranked.map(([n, i]) => `${n} (${i})`).join(' · ')}`);
  }
  return lines.join('\n');
}

export function formatBitacoraDiscord(wars, clanName = 'clandestinos') {
  const sorted = (wars || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const lines = [`📒 **Bitácora de guerras — ${clanName}**`, ''];
  for (const w of sorted) {
    const res = RES[w.res] || w.res || '—';
    const stars = w.stars || [0, 0];
    const emoji = w.res === 'V' ? '🟢' : w.res === 'D' ? '🔴' : '🟡';
    lines.push(`${emoji} **${fshort(w.date)}** vs **${w.rival || '—'}** — ${res} · ${stars[0]}-${stars[1]}`);
  }
  if (sorted.length) lines.push('', `_Total: ${sorted.length} guerras_`);
  return lines.join('\n');
}

export async function runDiscordBitacora({
  wars,
  clanName,
  webhookUrl,
  fetchImpl = fetch,
  log = console.log,
}) {
  if (!webhookUrl) {
    log('Discord bitácora: falta DISCORD_WEBHOOK_URL.');
    return { posted: false, reason: 'no-webhook' };
  }
  if (!(wars || []).length) {
    log('Discord bitácora: no hay guerras.');
    return { posted: false, reason: 'empty' };
  }
  const content = formatBitacoraDiscord(wars, clanName);
  const res = await fetchImpl(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    log(`Discord bitácora: fallo ${res.status}.`);
    return { posted: false, reason: 'http', status: res.status };
  }
  log(`Discord bitácora: enviadas ${wars.length} guerras.`);
  return { posted: true };
}

export function warsToAnnounce(wars, state) {
  const posted = state?.wars || {};
  if (!state?.bootstrapped) {
    return { mode: 'bootstrap', ids: (wars || []).map((w) => w.id).filter(Boolean) };
  }
  const pending = (wars || []).filter((w) => w.id && !posted[w.id]);
  return { mode: 'post', pending };
}

export function markWars(state, ids, at = new Date().toISOString()) {
  const next = {
    bootstrapped: true,
    wars: { ...(state?.wars || {}) },
  };
  for (const id of ids) {
    if (!next.wars[id]) next.wars[id] = { postedAt: at };
  }
  return next;
}

export async function runDiscordWars({
  wars,
  state,
  webhookUrl,
  fetchImpl = fetch,
  log = console.log,
}) {
  const plan = warsToAnnounce(wars, state);
  if (plan.mode === 'bootstrap') {
    const next = markWars(state || {}, plan.ids);
    log(`Discord guerras: bootstrap ${plan.ids.length} ya en historial (sin spam).`);
    return { state: next, posted: 0, bootstrapped: true };
  }
  if (!plan.pending.length) {
    log('Discord guerras: nada nuevo.');
    return { state, posted: 0 };
  }
  if (!webhookUrl) {
    log('Discord guerras: falta DISCORD_WEBHOOK_URL; se omite.');
    return { state, posted: 0, reason: 'no-webhook' };
  }
  let next = state;
  let posted = 0;
  for (const war of plan.pending) {
    const content = formatWarDiscord(war);
    const res = await fetchImpl(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      log(`Discord guerras: fallo ${res.status} en ${war.id}; se reintenta luego.`);
      return { state: next, posted, reason: 'http', status: res.status };
    }
    next = markWars(next, [war.id]);
    posted += 1;
    log(`Discord guerras: anunciada ${war.id} vs ${war.rival}.`);
  }
  return { state: next, posted };
}
