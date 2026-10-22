import { clipLines, postWebhook } from './discord-text.mjs';
import { buildBriefing } from './site-metrics.mjs';
import { buildWarHighlightPayload, resolveWarsFromSaved, warTop3 } from './war-highlight.mjs';

const RES = { V: 'Victoria', D: 'Derrota', E: 'Empate' };
const MEDAL = ['🥇', '🥈', '🥉'];
const COLOR = {
  header: 0x9b2c3c,
  top: 0xffc83d,
  analysis: 0x5aa7ff,
  prospects: 0x5ee08a,
};

function fshort(date) {
  if (!date) return 'Sin fecha';
  const p = date.split('-');
  const m = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${+p[2]} ${m[+p[1] - 1]}`;
}

function listOr(empty, rows, max = 1024) {
  return rows.length ? clipLines(rows, max) : empty;
}

function prospectsColumns(briefing) {
  const LTR = '\u200E';
  const all = briefing.prospects;
  const mid = Math.ceil(all.length / 2) || 0;
  const prosLine = (p) => `${LTR}${p.rank}. ${p.n} · **${p.score}**`;
  return {
    prosShow: all,
    prosLeft: all.slice(0, mid).map(prosLine),
    prosRight: all.slice(mid).map(prosLine),
  };
}

function prospectsEmbed(briefing, { kickoff = false } = {}) {
  const { prosShow, prosLeft, prosRight } = prospectsColumns(briefing);
  const outLines = briefing.trend.out.map((x) => `• **${x.n}** · \`${x.miss}/${x.pos}\` sin usar`);
  const fields = prosShow.length
    ? [
      {
        name: 'Alineación',
        value: listOr('_—_', prosLeft),
        inline: true,
      },
      {
        name: '\u200b',
        value: listOr('_—_', prosRight.length ? prosRight : ['\u200b']),
        inline: true,
      },
    ]
    : [{ name: 'Alineación', value: '_Sin prospectos._', inline: false }];
  if (kickoff && briefing.trend.out.length) {
    fields.push({
      name: `✕ Fuera · ${briefing.trend.out.length}`,
      value: listOr('_—_', outLines),
      inline: false,
    });
  }
  return {
    title: kickoff ? '⚔️ Alineación · iniciar guerra' : '⚔️ Prospectos · próxima guerra',
    description: kickoff
      ? `Sugeridos para la **próxima guerra**: **${briefing.prospects.length}** · pelearon ≥1 y no están fuera.`
      : `Sugeridos: **${briefing.prospects.length}** · pelearon ≥1 guerra y no están fuera.`,
    color: COLOR.prospects,
    fields,
  };
}

export function buildProspectsPayload(site) {
  const b = buildBriefing(site);
  const clan = b.clan.name || 'clandestinos';
  return {
    briefing: b,
    payload: {
      username: 'clandestinos.ops',
      embeds: [
        {
          ...prospectsEmbed(b, { kickoff: true }),
          timestamp: new Date().toISOString(),
          footer: { text: `${clan} · Alineación sugerida` },
        },
      ],
    },
  };
}

export async function runDiscordProspects({
  site,
  webhookUrl,
  force = false,
  fetchImpl = fetch,
  log = console.log,
}) {
  const { briefing, payload } = buildProspectsPayload(site);
  if (!force) {
    log(`Prospectos: ${briefing.prospects.length} sugeridos (sin enviar; usa force / enviar_prospectos).`);
    return { posted: false, reason: 'idle', briefing };
  }
  if (!webhookUrl) {
    log('Discord prospectos: falta DISCORD_WEBHOOK_URL.');
    return { posted: false, reason: 'no-webhook', briefing };
  }
  const res = await postWebhook(fetchImpl, webhookUrl, payload);
  if (!res.ok) {
    log(`Discord prospectos: webhook ${res.status || res.error}.`);
    return { posted: false, reason: 'http', status: res.status, briefing };
  }
  log(`Discord prospectos: enviada alineación (${briefing.prospects.length}).`);
  return { posted: true, reason: 'force', briefing };
}

function top3Fields(top3) {
  const fields = (top3 || []).map((p, i) => ({
    name: `${MEDAL[i] || `${i + 1}.`} ${p.n}`,
    value: [
      `**${p.score}** pts`,
      `Impacto \`${p.imp}\` · ★ \`${p.stars}\` · Don \`${p.don}\``,
      `Guerras \`${p.g}\`${p.miss ? ` · Sin usar \`${p.miss}\`` : ''}`,
    ].join('\n'),
    inline: true,
  }));
  while (fields.length < 3) {
    fields.push({ name: '—', value: '_Sin datos_', inline: true });
  }
  return fields;
}

/** Cumulative bitácora Top 3 (not a single-war podium — that belongs on `/war` / highlight). */
export function buildTop3Payload(site) {
  const b = buildBriefing(site);
  const clan = b.clan.name || 'clandestinos';
  const podium = (b.top3 || [])
    .map((p, i) => `${MEDAL[i] || `${i + 1}.`} **${p.n}** · **${p.score}** pts`)
    .join('\n');

  return {
    briefing: b,
    payload: {
      username: 'clandestinos.ops',
      embeds: [
        {
          title: `🏆 Top 3 · ${clan}`,
          description: [
            'Ranking **acumulado** de la bitácora (todas las guerras), no solo la última.',
            '',
            podium || '_Sin datos todavía._',
            '',
            `Historial: **${b.warsCount}** guerras · _70% impacto (liga ×2) + 30% donaciones · ≥1 guerra._`,
          ].join('\n'),
          color: COLOR.top,
          fields: top3Fields(b.top3),
          timestamp: new Date().toISOString(),
          footer: { text: `${clan} · Ranking acumulado` },
        },
      ],
    },
  };
}

/** Clan-wide status pulse — no last-war card, no Top 3 (use `/top`), no full lineup (use `/lineup`). */
export function buildReportPayload(site) {
  const b = buildBriefing(site);
  const clan = b.clan.name || 'clandestinos';
  // Trend = avg impact in last ≤2 wars vs earlier wars; ±10 to list.
  const upLines = b.trend.up.slice(0, 5).map((x) => `• **${x.n}** · impacto \`${x.from} → ${x.to}\` (\`+${x.d}\`)`);
  const downLines = b.trend.down.slice(0, 5).map((x) => `• **${x.n}** · impacto \`${x.from} → ${x.to}\` (\`${x.d}\`)`);
  const outLines = b.trend.out.slice(0, 8).map((x) => `• **${x.n}** · \`${x.miss}/${x.pos}\` ataques sin usar`);
  const outRule = '\n\n_Criterio: ≥2 ataques sin usar y ≥50% del cupo. Más detalle: `/discipline`._';

  const embeds = [
    {
      title: `📒 Estado del clan · ${clan}`,
      description: [
        `Bitácora: **${b.warsCount}** guerras · **${b.prospects.length}** en alineación · **${b.trend.out.length}** fuera.`,
        '',
        'Tendencia de **impacto en guerra**: promedio de las **últimas 2** vs el resto del historial (solo cambios de **±10** o más).',
      ].join('\n'),
      color: COLOR.header,
      fields: [
        {
          name: `▲ Impacto al alza · ${b.trend.up.length}`,
          value: listOr('_Nadie subió ≥10 de impacto._', upLines),
          inline: false,
        },
        {
          name: `▼ Impacto a la baja · ${b.trend.down.length}`,
          value: listOr('_Nadie bajó ≥10 de impacto._', downLines),
          inline: false,
        },
        {
          name: `✕ Cupo de ataques mal usado · ${b.trend.out.length}`,
          value: `${listOr('_Nadie está fuera por ataques sin usar._', outLines, 1024 - outRule.length)}${outRule}`,
          inline: false,
        },
      ],
      timestamp: new Date().toISOString(),
      footer: { text: `${clan} · Informe general` },
    },
  ];

  return {
    briefing: b,
    payload: {
      username: 'clandestinos.ops',
      embeds,
    },
  };
}

export function shouldSendReport(state, signature, { force = false } = {}) {
  if (force) return { send: true, reason: 'force' };
  if (!state?.bootstrapped) return { send: false, reason: 'bootstrap' };
  if (!signature) return { send: false, reason: 'empty' };
  if (state.signature === signature) return { send: false, reason: 'unchanged' };
  return { send: false, reason: 'updated' };
}

export function highlightQueue(state, saved = []) {
  const done = state?.highlights || {};
  const seen = new Set();
  const out = [];
  for (const file of [...(state?.pendingHighlights || []), ...(saved || [])]) {
    const key = String(file || '');
    if (!/^\d{8}-.+\.json$/i.test(key) || seen.has(key) || done[key]) continue;
    seen.add(key);
    out.push(key);
  }
  return out.slice(-40);
}

export async function runDiscordReport({
  site,
  state,
  webhookUrl,
  force = false,
  warEnded = false,
  saved = [],
  fetchImpl = fetch,
  log = console.log,
}) {
  void warEnded;
  const briefing = buildBriefing(site);
  const decision = shouldSendReport(state, briefing.signature, { force });
  const queue = highlightQueue(state, saved);
  const highlights = { ...(state?.highlights || {}) };
  const stillPending = [];
  let postedN = 0;
  let failedN = 0;
  let unresolvedN = 0;
  let lastStatus;

  if (queue.length && !webhookUrl) {
    stillPending.push(...queue);
    log('Discord highlight: falta DISCORD_WEBHOOK_URL; queda pendiente.');
  } else {
    for (const file of queue) {
      const war = resolveWarsFromSaved(site, [file])[0];
      if (!war) {
        unresolvedN += 1;
        stillPending.push(file);
        log(`Discord highlight: sin guerra para ${file}; se reintenta luego.`);
        continue;
      }
      if (war.id && Object.values(highlights).some((h) => h?.warId === war.id)) {
        highlights[file] = { postedAt: new Date().toISOString(), warId: war.id };
        continue;
      }
      const { payload } = buildWarHighlightPayload(war, { clan: site.clan });
      const res = await postWebhook(fetchImpl, webhookUrl, payload);
      if (!res.ok) {
        failedN += 1;
        lastStatus = res.status;
        stillPending.push(file);
        log(`Discord highlight: webhook ${res.status || res.error || 'error'} en ${file}; se reintenta luego.`);
        continue;
      }
      highlights[file] = { postedAt: new Date().toISOString(), warId: war.id || null };
      postedN += 1;
    }
  }

  const pendingHighlights = stillPending.slice(-40);
  const pack = (extra = {}) => ({
    bootstrapped: true,
    signature: pendingHighlights.length ? (state?.signature || '') : briefing.signature,
    postedAt: state?.postedAt ?? null,
    highlights,
    pendingHighlights,
    ...extra,
  });

  if (decision.reason === 'bootstrap' && !queue.length && !force) {
    const next = {
      bootstrapped: true,
      signature: briefing.signature,
      postedAt: null,
      highlights: state?.highlights || {},
      pendingHighlights: [],
    };
    log(`Discord informe: bootstrap (${briefing.warsCount} guerras, sin enviar).`);
    return { posted: false, state: next, reason: 'bootstrap', briefing };
  }

  let reportPosted = false;
  if (force) {
    if (!webhookUrl) {
      log('Discord informe: falta DISCORD_WEBHOOK_URL.');
      return { posted: postedN > 0, state: pack(), reason: 'no-webhook', briefing, highlightPosted: postedN };
    }
    const { payload } = buildReportPayload(site);
    const res = await postWebhook(fetchImpl, webhookUrl, payload);
    if (!res.ok) {
      log(`Discord informe: webhook ${res.status || res.error}; no se marca.`);
      return {
        posted: postedN > 0,
        state: pack(postedN > 0 ? { postedAt: new Date().toISOString() } : {}),
        reason: 'http',
        status: res.status,
        briefing,
        highlightPosted: postedN,
      };
    }
    reportPosted = true;
  }

  if (!force && !queue.length) {
    if (decision.reason === 'updated') {
      log('Discord informe: la firma cambió pero no hay highlight pendiente; no se envía el informe largo.');
      return {
        posted: false,
        reason: 'updated',
        briefing,
        state: {
          bootstrapped: true,
          signature: briefing.signature,
          postedAt: state?.postedAt ?? null,
          highlights: state?.highlights || {},
          pendingHighlights: state?.pendingHighlights || [],
        },
      };
    }
    log(`Discord informe: omitido (${decision.reason}).`);
    return { posted: false, state, reason: decision.reason, briefing };
  }

  if (!force && queue.length && !postedN && pendingHighlights.length) {
    const reason = !webhookUrl ? 'no-webhook' : (failedN ? 'http' : 'pending');
    log(`Discord highlight: nada enviado (${reason}, sin resolver ${unresolvedN}).`);
    return {
      posted: false,
      state: pack(),
      reason,
      status: lastStatus,
      briefing,
      highlightPosted: 0,
    };
  }

  const next = pack((postedN > 0 || reportPosted) ? { postedAt: new Date().toISOString() } : {});
  if (reportPosted) {
    if (postedN) log(`Discord highlight: enviado (${postedN} guerra(s)).`);
    log(`Discord informe: enviado (force; Top 3, análisis, ${briefing.prospects.length} prospectos).`);
    return { posted: true, state: next, reason: 'force', briefing, highlightPosted: postedN };
  }
  if (!postedN) {
    log('Discord highlight: archivos ya cubiertos; no se reenvía.');
    return { posted: false, state: next, reason: 'unchanged', briefing, highlightPosted: 0 };
  }
  log(`Discord highlight: enviado (${postedN} guerra(s)).`);
  return { posted: true, state: next, reason: 'war-ended', briefing, highlightPosted: postedN };
}
