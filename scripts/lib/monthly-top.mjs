import { scoredList } from './site-metrics.mjs';

const TZ = 'America/Mexico_City';
const SNAPSHOT_KEEP_DAYS = 120;

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

export function dayKeyInZone(date = new Date(), timeZone = TZ) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(date)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function shiftDayKey(day, delta) {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

export function recordDonationSnapshot(snapshots, roster, now = new Date(), timeZone = TZ) {
  const day = dayKeyInZone(now, timeZone);
  const days = { ...(snapshots?.days || {}) };
  if ((roster || []).length) {
    const row = {};
    for (const m of roster) row[m[0]] = m[4] || 0;
    days[day] = row;
  }
  const cutoff = shiftDayKey(day, -SNAPSHOT_KEEP_DAYS);
  for (const key of Object.keys(days)) {
    if (key < cutoff) delete days[key];
  }
  return { days };
}

/** Último snapshot del mes antes de un reset de temporada (la suma cae a menos de la mitad). */
export function donationsForMonth(snapshots, monthKey) {
  const days = snapshots?.days || {};
  const keys = Object.keys(days).filter((d) => d.startsWith(`${monthKey}-`)).sort();
  if (!keys.length) return null;
  let prevSum = null;
  let last = null;
  let preReset = null;
  for (const key of keys) {
    const row = days[key] || {};
    const sum = Object.values(row).reduce((acc, v) => acc + (Number(v) || 0), 0);
    if (preReset == null && prevSum != null && prevSum >= 100 && sum < prevSum * 0.5) {
      preReset = last;
    }
    last = row;
    prevSum = sum;
  }
  return preReset || last;
}

export function scoreMonth(wars, roster, donationsOverride = undefined) {
  const list = scoredList(wars, roster, donationsOverride);
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

export function monthCloseDate(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const close = new Date(y, m, 1);
  return {
    date: close,
    key: `${close.getFullYear()}-${String(close.getMonth() + 1).padStart(2, '0')}`,
    label: new Intl.DateTimeFormat('es-MX', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(close),
    short: new Intl.DateTimeFormat('es-MX', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(close),
  };
}

const MEDAL = ['🥇', '🥈', '🥉'];

export function discordPassRulesPayload(monthKey) {
  const label = monthLabelEs(monthKey);
  const close = monthCloseDate(monthKey);
  return {
    username: 'clandestinos.ops',
    embeds: [
      {
        title: '🎁 Premio del mes · Pase de batalla',
        description: [
          `Durante **${label}**, el clan compite por el **pase de batalla**.`,
          '',
          '### Cómo se gana',
          `El **${close.label}** (00:00, Mexico City) se cierra el ranking.`,
          'Quien quede **Top 1** ese día se lleva el pase.',
          'Hasta entonces **no hay ganador anunciado**: cuenta todo el mes (guerras normales, **liga de clanes** y donaciones).',
          '',
          '### Ranking',
          '• **70%** impacto en guerra — la **liga de clanes pesa el doble**',
          '• **30%** donaciones (relativas al mayor donador)',
          '• Empate: estrellas → neto → ataques sin usar',
          '',
          '### Entrega',
          'Un líder entrega el pase a mano cuando se publique el Top 1 oficial.',
          '',
          '¡Échenle ganas! El pase se lo lleva quien pelee por el **primer lugar** — ataquen, donen y no se duerman. ¡A por el Top 1!',
        ].join('\n'),
        color: 0xffc83d,
        fields: [
          {
            name: '📅 Cierra el',
            value: `**${close.short}**\n00:00 Mexico City`,
            inline: true,
          },
          {
            name: '🏆 Premio',
            value: '**1 pase de batalla**\npara el Top 1',
            inline: true,
          },
          {
            name: '👀 Mientras tanto',
            value: 'Compite en guerra y dona.\nEl resultado se revela al cierre.',
            inline: true,
          },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: `clandestinos.ops · cierra ${close.short}` },
      },
    ],
  };
}

export function discordMonthlyPayload(result, monthKey) {
  const label = monthLabelEs(monthKey);
  const fields = (result.top3 || []).map(([n, s], i) => ({
    name: `${MEDAL[i] || `${i + 1}.`} ${n}`,
    value: `**${s}** pts`,
    inline: true,
  }));
  return {
    username: 'clandestinos.ops',
    embeds: [
      {
        title: '🎁 Pase del mes · ganador',
        description: [
          `Cierre de **${label}**.`,
          '',
          `🏆 **Top 1: ${result.winner}** — **${result.score}** pts`,
          '',
          `**${result.winner}** se lleva el **pase de batalla**. Un líder lo entrega a mano.`,
          '',
          '_Fórmula: 70% impacto (liga ×2) + 30% donaciones._',
        ].join('\n'),
        color: 0xffc83d,
        fields,
        timestamp: new Date().toISOString(),
        footer: { text: 'clandestinos.ops · premio mensual' },
      },
    ],
  };
}
