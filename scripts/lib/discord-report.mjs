import { buildBriefing } from './site-metrics.mjs';

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

function clip(text, max = 1024) {
  const s = String(text || '');
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function listOr(empty, rows) {
  return rows.length ? rows.join('\n') : empty;
}

export function buildReportPayload(site, { pageUrl } = {}) {
  const b = buildBriefing(site);
  const clan = b.clan.name || 'clandestinos';
  const last = b.last;
  const lastLine = last
    ? `Última guerra: **${fshort(last.date)}** vs **${last.rival || '—'}** · ${RES[last.res] || last.res || '—'} · ${(last.stars || [0, 0]).join('-')}`
    : 'Sin guerras registradas.';

  const topFields = b.top3.map((p, i) => ({
    name: `${MEDAL[i] || `${i + 1}.`} ${p.n}`,
    value: [
      `**${p.score}** pts`,
      `Impacto \`${p.imp}\` · ★ \`${p.stars}\` · Don \`${p.don}\``,
      `Guerras \`${p.g}\`${p.miss ? ` · Sin usar \`${p.miss}\`` : ''}`,
    ].join('\n'),
    inline: true,
  }));

  while (topFields.length < 3) {
    topFields.push({ name: '—', value: '_Sin datos_', inline: true });
  }

  const upLines = b.trend.up.slice(0, 8).map((x) => `• **${x.n}** · \`+${x.d}\` · ${x.from} → ${x.to}`);
  const downLines = b.trend.down.slice(0, 8).map((x) => `• **${x.n}** · \`${x.d}\` · ${x.from} → ${x.to}`);
  const outLines = b.trend.out.slice(0, 10).map((x) => `• **${x.n}** · \`${x.miss}/${x.pos}\` sin usar`);

  const LTR = '\u200E';
  const prosShow = b.prospects.slice(0, 16);
  const prosExtra = b.prospects.length - prosShow.length;
  const prosLine = (p) => `${LTR}${p.rank}. ${p.n} · **${p.score}**`;
  const prosLeft = prosShow.slice(0, 8).map(prosLine);
  const prosRight = prosShow.slice(8, 16).map(prosLine);
  if (prosExtra > 0) prosRight.push(`${LTR}_…y ${prosExtra} más_`);

  const embeds = [
    {
      title: `📒 Informe de guerra · ${clan}`,
      description: [
        lastLine,
        '',
        `Historial: **${b.warsCount}** guerras · Ranking **70% impacto + 30% donaciones**`,
        pageUrl ? `[Abrir bitácora](${pageUrl})` : null,
      ].filter(Boolean).join('\n'),
      color: COLOR.header,
      timestamp: new Date().toISOString(),
      footer: { text: `${clan} · Bitácora de guerras` },
    },
    {
      title: '🏆 Top 3',
      description: 'Quienes más aportan al clan (con ≥1 guerra).',
      color: COLOR.top,
      fields: topFields,
    },
    {
      title: '📊 Análisis',
      description: 'Últimas 2 guerras frente al resto del historial (±10 impacto).',
      color: COLOR.analysis,
      fields: [
        {
          name: `▲ Mejoraron · ${b.trend.up.length}`,
          value: clip(listOr('_Nadie subió de forma clara._', upLines)),
          inline: false,
        },
        {
          name: `▼ Bajaron · ${b.trend.down.length}`,
          value: clip(listOr('_Nadie bajó de forma clara._', downLines)),
          inline: false,
        },
        {
          name: `✕ Fuera de guerra · ${b.trend.out.length}`,
          value: clip(listOr('_Todos cumplen con sus ataques._', outLines) + '\n\n_Regla: ≥2 ataques sin usar y ≥50%._'),
          inline: false,
        },
      ],
    },
    {
      title: '⚔️ Prospectos · próxima guerra',
      description: `Sugeridos: **${b.prospects.length}** · pelearon ≥1 guerra y no están fuera.`,
      color: COLOR.prospects,
      fields: prosShow.length
        ? [
          {
            name: 'Alineación',
            value: clip(listOr('_—_', prosLeft)),
            inline: true,
          },
          {
            name: '\u200b',
            value: clip(listOr('_—_', prosRight.length ? prosRight : ['\u200b'])),
            inline: true,
          },
        ]
        : [{ name: 'Alineación', value: '_Sin prospectos._', inline: false }],
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
  return { send: true, reason: 'updated' };
}

export async function runDiscordReport({
  site,
  state,
  webhookUrl,
  force = false,
  pageUrl = 'https://raulaltamirano.github.io/war-room/',
  fetchImpl = fetch,
  log = console.log,
}) {
  const { briefing, payload } = buildReportPayload(site, { pageUrl });
  const decision = shouldSendReport(state, briefing.signature, { force });

  if (decision.reason === 'bootstrap') {
    const next = { bootstrapped: true, signature: briefing.signature, postedAt: null };
    log(`Discord informe: bootstrap (${briefing.warsCount} guerras, sin enviar).`);
    return { posted: false, state: next, reason: 'bootstrap', briefing };
  }

  if (!decision.send) {
    log(`Discord informe: omitido (${decision.reason}).`);
    return { posted: false, state, reason: decision.reason, briefing };
  }

  if (!webhookUrl) {
    log('Discord informe: falta DISCORD_WEBHOOK_URL.');
    return { posted: false, state, reason: 'no-webhook', briefing };
  }

  const res = await fetchImpl(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    log(`Discord informe: webhook ${res.status}; no se marca.`);
    return { posted: false, state, reason: 'http', status: res.status, briefing };
  }

  const next = {
    bootstrapped: true,
    signature: briefing.signature,
    postedAt: new Date().toISOString(),
  };
  log(`Discord informe: enviado (Top 3, análisis, ${briefing.prospects.length} prospectos).`);
  return { posted: true, state: next, reason: decision.reason, briefing };
}
