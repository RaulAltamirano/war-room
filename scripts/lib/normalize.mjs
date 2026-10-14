const MAP_LG = { Bronze: 'Bronce', Silver: 'Plata', Gold: 'Oro', Crystal: 'Cristal', Master: 'Maestro', Champion: 'Campeón' };
const MAP_LBL = {
  'Clan War League': 'Liga de Guerras',
  'Clan Games': 'Juegos del Clan',
  Farming: 'Farmeo',
  'Clan Wars': 'Guerras de Clanes',
  'Clan Capital': 'Capital del Clan',
  'Friendly Wars': 'Guerras amistosas',
  Friendly: 'Amistoso',
  Competitive: 'Competitivo',
  Donations: 'Donaciones',
  Talkative: 'Conversador',
  'Newbie Friendly': 'Para novatos',
  'Base Designing': 'Diseño de aldeas',
  'Builder Base': 'Base del constructor',
  International: 'Internacional',
  Relaxed: 'Relajado',
  'Active Donator': 'Donador activo',
  Underdog: 'Desvalido',
  'Trophy Pushing': 'Subir trofeos',
  'Hall of Fame': 'Salón de la fama',
};
const MAP_DIS = {
  'Capital Peak': 'Pico de la Capital',
  'Barbarian Camp': 'Campamento Bárbaro',
  'Wizard Valley': 'Valle de los Magos',
  'Balloon Lagoon': 'Laguna de los Globos',
  "Builder's Workshop": 'Taller del Constructor',
  'Dragon Cliffs': 'Acantilados del Dragón',
  'Golem Quarry': 'Cantera de Gólems',
  'Skeleton Park': 'Parque de Esqueletos',
  'Goblin Mines': 'Minas de Duendes',
};
const MAP_FREQ = {
  always: 'Siempre',
  moreThanOncePerWeek: 'Más de una vez por semana',
  oncePerWeek: 'Una vez por semana',
  lessThanOncePerWeek: 'Menos de una por semana',
  never: 'Nunca',
  unknown: 'Sin definir',
};
const MAP_TYPE = { open: 'Abierto a todos', inviteOnly: 'Solo con invitación', closed: 'Cerrado' };
const MAP_RL = { leader: 'L', coLeader: 'C', admin: 'E', member: 'M' };

export const CLAN_TAG = '#2RGC02RYC';

export function trLeague(s) {
  const m = /^(Bronze|Silver|Gold|Crystal|Master|Champion) League ?(I{1,3})?$/.exec(s || '');
  if (m) return MAP_LG[m[1]] + (m[2] ? ' ' + m[2] : '');
  if (s === 'Unranked') return 'Sin clasificar';
  return s || '—';
}

function badgeOf(j) {
  const b = j && j.badgeUrls;
  if (!b) return '';
  return b.medium || b.large || b.small || '';
}

export function fromApi(j) {
  const loc = j.location && j.location.name;
  const clan = {
    name: j.name,
    level: j.clanLevel,
    tag: j.tag,
    badge: badgeOf(j),
    w: j.warWins || 0,
    t: j.warTies || 0,
    l: j.warLosses || 0,
    streak: j.warWinStreak || 0,
    league: trLeague(j.warLeague && j.warLeague.name),
    capLeague: trLeague(j.capitalLeague && j.capitalLeague.name),
    trophies: j.clanPoints || 0,
    builder: j.clanBuilderBasePoints || 0,
    capital: j.clanCapitalPoints || 0,
    members: j.members || (j.memberList || []).length,
    freq: MAP_FREQ[j.warFrequency] || j.warFrequency || '—',
    location: loc === 'International' ? 'Internacional' : (loc || '—'),
    join: MAP_TYPE[j.type] || j.type || '—',
    desc: j.description || '',
    reqTH: j.requiredTownhallLevel || 0,
    reqTrophies: j.requiredTrophies || 0,
    labels: (j.labels || []).map((l) => MAP_LBL[l.name] || l.name),
    lang: (j.chatLanguage && j.chatLanguage.name) || '',
    family: !!j.isFamilyFriendly,
    warLogPublic: !!j.isWarLogPublic,
    capitalHall: (j.clanCapital && j.clanCapital.capitalHallLevel) || 0,
    districts: ((j.clanCapital && j.clanCapital.districts) || []).map((d) => [
      MAP_DIS[d.name] || d.name,
      d.districtHallLevel,
      d.name === 'Capital Peak' ? 10 : 5,
    ]),
  };
  const roster = (j.memberList || []).map((m) => [
    m.name,
    MAP_RL[m.role] || 'M',
    m.townHallLevel,
    m.expLevel,
    m.donations || 0,
    m.donationsReceived || 0,
    m.builderBaseTrophies || 0,
  ]);
  return { clan, roster };
}

export function perOf(war) {
  const n = Number(war.attacksPerMember);
  if (Number.isFinite(n) && n > 0) return n;
  if (war.warTag) return 1;
  return 2;
}

export function pickSides(war, clanTag = CLAN_TAG) {
  if (war.clan?.tag === clanTag) return { us: war.clan, them: war.opponent };
  if (war.opponent?.tag === clanTag) return { us: war.opponent, them: war.clan };
  return null;
}

export function warResult(us, them) {
  const usStars = us.stars || 0;
  const themStars = them.stars || 0;
  if (usStars !== themStars) return usStars > themStars ? 'V' : 'D';
  const usD = us.destructionPercentage || 0;
  const themD = them.destructionPercentage || 0;
  if (usD !== themD) return usD > themD ? 'V' : 'D';
  return 'E';
}

export function startDate(war) {
  const s = war.startTime || '';
  if (/^\d{8}T/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  throw new Error('startTime inválido');
}

export function rawFileName(war, clanTag = CLAN_TAG) {
  const sides = pickSides(war, clanTag);
  if (!sides?.them?.tag || !war.startTime) return null;
  const day = String(war.startTime).slice(0, 8);
  const opp = String(sides.them.tag).replace(/^#/, '');
  if (!/^\d{8}$/.test(day) || !opp) return null;
  return `${day}-${opp}.json`;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

export function memberStats(us, per) {
  const attacks = [];
  for (const m of us.members || []) {
    for (const a of m.attacks || []) attacks.push(a);
  }
  attacks.sort((a, b) => a.order - b.order);
  const best = new Map();
  const agg = new Map();
  for (const m of us.members || []) {
    agg.set(m.tag, { nuevas: 0, impact: 0, counts: [0, 0, 0, 0], done: 0 });
  }
  for (const a of attacks) {
    const row = agg.get(a.attackerTag);
    if (!row) continue;
    const prev = best.get(a.defenderTag) || 0;
    const stars = a.stars || 0;
    row.nuevas += Math.max(0, stars - prev);
    best.set(a.defenderTag, Math.max(prev, stars));
    row.impact += (stars / 3) * 70 + (a.destructionPercentage || 0) * 0.3;
    row.counts[stars] += 1;
    row.done += 1;
  }
  return (us.members || []).slice().sort((a, b) => (a.mapPosition || 0) - (b.mapPosition || 0)).map((m) => {
    const row = agg.get(m.tag) || { nuevas: 0, impact: 0, counts: [0, 0, 0, 0], done: 0 };
    const unused = per - row.done;
    const starSum = (m.attacks || []).reduce((sum, a) => sum + (a.stars || 0), 0);
    const opp = m.opponentAttacks || 0;
    const boa = opp > 0 ? m.bestOpponentAttack : null;
    const defStars = boa ? (boa.stars || 0) : 0;
    const atk = [3, 2, 1, 0].map((k) => Math.round((100 * (row.counts[k] || 0)) / per));
    const def = [0, 0, 0, 0];
    if (opp > 0 && boa) def[3 - defStars] = 100;
    const stats = [
      Math.round(row.impact / per),
      round2(starSum / per),
      round2(row.nuevas / per),
      Math.round((100 * unused) / per),
      unused,
      row.nuevas - (boa ? (boa.stars || 0) : 0),
      ...atk,
      ...def,
      per,
    ];
    const hits = (m.attacks || []).slice().sort((a, b) => a.order - b.order).map((a) => [
      a.stars || 0,
      a.destructionPercentage || 0,
      a.order || 0,
    ]);
    return {
      tag: m.tag,
      name: m.name,
      stats,
      th: m.townhallLevel || m.townHallLevel || 0,
      map: m.mapPosition || 0,
      attacks: hits,
    };
  });
}

export function summarizeWar(war, clanTag = CLAN_TAG) {
  const sides = pickSides(war, clanTag);
  if (!sides) throw new Error('El clan no está en la guerra');
  return {
    date: startDate(war),
    rival: sides.them.name || '',
    res: warResult(sides.us, sides.them),
    stars: [sides.us.stars || 0, sides.them.stars || 0],
  };
}

export function normalizeWar(war, { clanTag = CLAN_TAG, byTag = new Map() } = {}) {
  const sides = pickSides(war, clanTag);
  if (!sides) throw new Error('El clan no está en la guerra');
  const date = startDate(war);
  const per = perOf(war);
  const members = memberStats(sides.us, per).map((m) => {
    const cur = byTag.get(m.tag);
    return [
      cur?.name || m.name,
      cur ? (MAP_RL[cur.role] || 'M') : 'M',
      m.stats,
      m.th,
      m.map,
      m.attacks,
    ];
  });
  return {
    id: 'w' + date.replace(/-/g, ''),
    date,
    rival: sides.them.name || '',
    res: warResult(sides.us, sides.them),
    stars: [sides.us.stars || 0, sides.them.stars || 0],
    liga: per === 1,
    members,
  };
}

export function buildSite({
  clanJson,
  rawWars = [],
  generatedAt,
  clanTag = CLAN_TAG,
}) {
  const { clan, roster } = fromApi(clanJson || {});
  const byTag = new Map();
  for (const m of clanJson?.memberList || []) {
    if (m.tag) byTag.set(m.tag, m);
  }
  const wars = [];
  const seen = new Set();
  for (const raw of rawWars) {
    const war = normalizeWar(raw, { clanTag, byTag });
    let id = war.id;
    if (seen.has(id)) id = `${war.id}-${String(pickSides(raw, clanTag).them.tag || '').replace(/^#/, '')}`;
    seen.add(id);
    wars.push({ ...war, id });
  }
  wars.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return { generatedAt, clan, roster, wars };
}

const IMAGE_KEYS = new Set(['badgeUrls', 'iconUrls']);

export function stripImages(value, { keepBadge = false } = {}) {
  if (Array.isArray(value)) return value.map((v) => stripImages(v, { keepBadge: false }));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === 'badgeUrls' && keepBadge) {
        out[k] = v;
        continue;
      }
      if (IMAGE_KEYS.has(k)) continue;
      out[k] = stripImages(v, { keepBadge: false });
    }
    return out;
  }
  return value;
}
