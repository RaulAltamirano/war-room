/**
 * War attack scout: mirror-or-better target + TH-tier army hint.
 * Uses current-war roster only (TH + map position). No base layouts from the API.
 */

import { CLAN_TAG, pickSides as defaultPickSides } from './normalize.mjs';

const DEFAULT_BASE = 'https://cocproxy.royaleapi.dev/v1';

function enc(tag) {
  return encodeURIComponent(tag);
}

/** @param {number} th */
export function armyForTh(th) {
  const t = Number(th) || 0;
  if (t >= 17) {
    return {
      label: 'Root Rider Smash',
      detail: 'Root Riders + sanadoras + Aprendiz de Guardián; Rage / Freeze / Recall',
    };
  }
  if (t >= 16) {
    return {
      label: 'Root Rider / Dragon Rider',
      detail: 'Root Riders o Dragon Riders + globos; Freeze / Rage',
    };
  }
  if (t >= 15) {
    return {
      label: 'E-Drag / Root Rider',
      detail: 'Electro Dragons en línea o Root Riders; Freeze / Rage',
    };
  }
  if (t >= 14) {
    return {
      label: 'E-Drag / Hybrid',
      detail: 'Electro Dragons o Hog + Miner; Freeze / Rage / Heal',
    };
  }
  if (t >= 13) {
    return {
      label: 'Zap Drag / E-Drag',
      detail: 'Dragones con rayos o Electro Dragons; Freeze',
    };
  }
  if (t >= 12) {
    return {
      label: 'Electro Titan / Dragones',
      detail: 'Electro Titans o dragones; Freeze / Rage',
    };
  }
  if (t >= 11) {
    return {
      label: 'E-Drag / Hogs',
      detail: 'Electro Dragons o montapuercos; Heal / Rage',
    };
  }
  return {
    label: 'Tu mejor push',
    detail: 'Usa el ejército con el que ya 3★ en multiplayer',
  };
}

/**
 * @param {number} atkTh
 * @param {number} defTh
 * @returns {{ ok: boolean, reason: string }}
 */
export function mirrorOk(atkTh, defTh) {
  const a = Number(atkTh) || 0;
  const d = Number(defTh) || 0;
  const delta = d - a;
  if (delta <= 0) return { ok: true, reason: 'espejo igual o más bajo' };
  if (delta === 1) return { ok: true, reason: 'espejo +1 TH (apretado)' };
  return { ok: false, reason: `espejo +${delta} TH (muy alto)` };
}

function slimMember(m) {
  return {
    tag: m.tag || '',
    name: m.name || '?',
    th: m.townhallLevel || m.townHallLevel || m.th || 0,
    pos: m.mapPosition || m.pos || m.map || 0,
    attacks: Array.isArray(m.attacks) ? m.attacks.length : Number(m.attacks) || 0,
  };
}

/**
 * Snapshot from a CoC currentwar payload (preparation | inWar).
 * @param {object} war
 * @param {string} clanTag
 * @param {{ pickSides: Function, at?: string }} deps
 */
export function snapshotActiveWar(war, clanTag, { pickSides, at } = {}) {
  if (!war || (war.state !== 'preparation' && war.state !== 'inWar')) {
    return {
      state: war?.state || 'notInWar',
      at: at || new Date().toISOString(),
    };
  }
  const sides = pickSides(war, clanTag);
  if (!sides) {
    return { state: 'notInWar', at: at || new Date().toISOString() };
  }
  return {
    state: war.state,
    teamSize: war.teamSize || (sides.us.members || []).length,
    attacksPerMember: Number(war.attacksPerMember) || (war.warTag ? 1 : 2),
    rival: sides.them.name || '',
    rivalTag: sides.them.tag || '',
    us: (sides.us.members || []).map(slimMember),
    them: (sides.them.members || []).map(slimMember),
    at: at || new Date().toISOString(),
  };
}

/**
 * Live current war (regular or CWL) → scout snapshot.
 * @param {{ token: string, clanTag?: string, base?: string, fetchImpl?: typeof fetch, pickSides?: Function }} opts
 */
export async function fetchActiveWarSnapshot({
  token,
  clanTag = CLAN_TAG,
  base = DEFAULT_BASE,
  fetchImpl = fetch,
  pickSides = defaultPickSides,
} = {}) {
  if (!token) {
    return { state: 'notInWar', at: new Date().toISOString(), source: 'no-token' };
  }
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'User-Agent': 'clandestinos-ops (war-scout)',
  };

  const currentRes = await fetchImpl(`${base}/clans/${enc(clanTag)}/currentwar`, { headers });
  if (!currentRes.ok) {
    const err = new Error(`currentwar HTTP ${currentRes.status}`);
    err.status = currentRes.status;
    throw err;
  }
  const current = await currentRes.json();
  let snap = snapshotActiveWar(current, clanTag, { pickSides });
  if (snap.state === 'preparation' || snap.state === 'inWar') {
    return { ...snap, source: 'currentwar' };
  }

  const leagueRes = await fetchImpl(`${base}/clans/${enc(clanTag)}/currentwar/leaguegroup`, { headers });
  if (leagueRes.status === 404) {
    return { ...snap, source: 'currentwar' };
  }
  if (!leagueRes.ok) {
    const err = new Error(`leaguegroup HTTP ${leagueRes.status}`);
    err.status = leagueRes.status;
    throw err;
  }
  const league = await leagueRes.json();
  for (const round of league.rounds || []) {
    for (const warTag of round.warTags || []) {
      if (!warTag || warTag === '#0') continue;
      const warRes = await fetchImpl(`${base}/clanwarleagues/wars/${enc(warTag)}`, { headers });
      if (!warRes.ok) continue;
      const war = await warRes.json();
      if (war.state !== 'preparation' && war.state !== 'inWar') continue;
      if (!pickSides(war, clanTag)) continue;
      return {
        ...snapshotActiveWar(
          { ...war, warTag: war.warTag || warTag },
          clanTag,
          { pickSides },
        ),
        source: 'cwl',
        warTag: war.warTag || warTag,
      };
    }
  }
  return { ...snap, source: 'none' };
}

/**
 * From already-fetched current + optional league war payloads (used by scripts/fetch.mjs).
 */
export function pickActiveWarFromFetched(currentWar, leagueWars, clanTag, pickSides = defaultPickSides) {
  let snap = snapshotActiveWar(currentWar, clanTag, { pickSides });
  if (snap.state === 'preparation' || snap.state === 'inWar') {
    return { ...snap, source: 'currentwar' };
  }
  for (const war of leagueWars || []) {
    if (war?.state !== 'preparation' && war?.state !== 'inWar') continue;
    if (!pickSides(war, clanTag)) continue;
    return { ...snapshotActiveWar(war, clanTag, { pickSides }), source: 'cwl' };
  }
  return { ...snap, source: 'none' };
}

/**
 * @param {object} activeWar
 * @returns {{ rows: object[], summary: string } | { error: string }}
 */
export function buildScoutPlan(activeWar) {
  if (!activeWar || (activeWar.state !== 'preparation' && activeWar.state !== 'inWar')) {
    return { error: 'no-war' };
  }
  const us = [...(activeWar.us || [])].sort((a, b) => a.pos - b.pos);
  const them = [...(activeWar.them || [])].sort((a, b) => a.pos - b.pos);
  if (!us.length || !them.length) return { error: 'empty' };

  const taken = new Set();
  const rows = [];

  for (const attacker of us) {
    const mirror = them.find((e) => e.pos === attacker.pos);
    let target = null;
    let mode = 'espejo';
    let note = '';

    if (mirror && !taken.has(mirror.tag)) {
      const check = mirrorOk(attacker.th, mirror.th);
      if (check.ok) {
        target = mirror;
        note = check.reason;
      } else {
        mode = 'otro';
        note = check.reason;
      }
    } else {
      mode = 'otro';
      note = mirror ? 'espejo ya asignado' : 'sin espejo';
    }

    if (!target) {
      const pool = them.filter((e) => !taken.has(e.tag));
      const prefer = pool.filter((e) => e.th <= attacker.th);
      const ranked = (prefer.length ? prefer : pool).slice().sort((x, y) => {
        const thDiff = Math.abs(x.th - attacker.th) - Math.abs(y.th - attacker.th);
        if (thDiff) return thDiff;
        return Math.abs(x.pos - attacker.pos) - Math.abs(y.pos - attacker.pos);
      });
      target = ranked[0] || null;
      if (target && prefer.length && target.th <= attacker.th) {
        note = note ? `${note} → dip TH${target.th}` : `dip a TH${target.th}`;
      } else if (target) {
        note = note ? `${note} → mejor match` : 'mejor match disponible';
      }
    }

    if (target) taken.add(target.tag);
    rows.push({
      attacker,
      target,
      mode,
      note,
      army: armyForTh(attacker.th),
    });
  }

  const mirrors = rows.filter((r) => r.mode === 'espejo').length;
  const summary = `${mirrors}/${rows.length} espejos recomendados`;
  return { rows, summary };
}
