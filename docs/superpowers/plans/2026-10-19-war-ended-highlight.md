# War-ended Discord highlight — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Al guardar una guerra `warEnded`, Discord recibe un embed corto (resultado, MVP, Top 3 ataques, no atacaron); el informe largo solo con envío forzado.

**Architecture:** Nuevo `scripts/lib/war-highlight.mjs` calcula MVP/ataques/no-atacaron desde una guerra de `site.json`. `discord-report` resuelve cada archivo en `last-fetch.saved` a una guerra y postea un highlight por archivo; `force` sin `warEnded` sigue el informe de 4 embeds.

**Tech Stack:** Node 22 ESM, webhook Discord, tests `node --test`. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-10-19-war-ended-highlight-design.md`

## Global Constraints

- Un embed por archivo en `saved`; orden = orden de `saved`.
- Informe largo (`buildReportPayload`) solo con `force` / `DISCORD_SEND_REPORT` sin camino highlight.
- Nombres: LTR `\u200E` + FSI `\u2068`…PDI `\u2069` (como ban-zones).
- Username: `clandestinos.ops`.
- Sin webhook → skip; HTTP no OK → no marcar firma.
- No comentarios narrativos; solo invariantes no obvios.
- Commits convencionales en español.

## File map

| File | Responsibility |
|------|----------------|
| `scripts/lib/war-highlight.mjs` | Resolver saved→war; MVP; top ataques; no atacaron; payload Discord |
| `tests/war-highlight.test.mjs` | Unit del highlight |
| `scripts/lib/discord-report.mjs` | `runDiscordReport` usa highlight si `warEnded` + `saved` |
| `scripts/discord-report.mjs` | Pasa `saved` desde `last-fetch.json` |
| `tests/discord-report.test.mjs` | warEnded → 1 embed highlight; force → 4 embeds |
| `README.md`, `CLAUDE.md` | Una línea: warEnded = highlight corto |

---

### Task 1: Helper highlight (TDD)

**Files:**
- Create: `scripts/lib/war-highlight.mjs`
- Create: `tests/war-highlight.test.mjs`

**Interfaces:**
- Produces:
  - `resolveWarsFromSaved(site, saved: string[]): object[]`
  - `warMvp(war): { n, impact, attackStars } | null`
  - `topAttacks(war, limit=3): { n, stars, destruction, order }[]`
  - `didNotAttack(war): string[]`
  - `buildWarHighlightPayload(war, { clan }): { payload, meta }`

- [ ] **Step 1: Write failing tests**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildWarHighlightPayload,
  didNotAttack,
  resolveWarsFromSaved,
  topAttacks,
  warMvp,
} from '../scripts/lib/war-highlight.mjs';

function mem(name, impact, unused, pos, attacks) {
  const mp = pos ? Math.round((unused * 100) / pos) : 0;
  const s = [impact, 0, 0, mp, unused, 0, 0, 0, 0, 0, 0, 0, 0, 0, pos];
  return [name, 'M', s, 15, 1, attacks || []];
}

const war = {
  id: 'w20261013',
  date: '2026-10-13',
  rival: 'SAVAGE FOUR',
  res: 'V',
  stars: [54, 0],
  members: [
    mem('Alpha', 100, 0, 2, [[3, 100, 1], [3, 98, 2]]),
    mem('Beta', 80, 0, 2, [[2, 90, 3]]),
    mem('Gamma', 10, 2, 2, []),
    mem('اوراس', 50, 0, 1, [[3, 99, 4]]),
  ],
};

test('topAttacks ordena estrellas ↓ destrucción ↓', () => {
  const t = topAttacks(war, 3);
  assert.equal(t.length, 3);
  assert.equal(t[0].n, 'Alpha');
  assert.equal(t[0].stars, 3);
  assert.equal(t[0].destruction, 100);
  assert.equal(t[1].n, 'اوراس');
  assert.equal(t[1].destruction, 99);
});

test('warMvp es el de mayor impacto', () => {
  const m = warMvp(war);
  assert.equal(m.n, 'Alpha');
  assert.equal(m.impact, 100);
});

test('didNotAttack lista unused===pos', () => {
  assert.deepEqual(didNotAttack(war), ['Gamma']);
});

test('resolveWarsFromSaved mapea YYYYMMDD-tag a date', () => {
  const site = { wars: [war, { ...war, id: 'w20261011', date: '2026-10-11', rival: 'OTHER' }] };
  const rows = resolveWarsFromSaved(site, ['20261013-AAAA.json']);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].date, '2026-10-13');
});

test('buildWarHighlightPayload un embed con RTL', () => {
  const { payload } = buildWarHighlightPayload(war, { clan: { name: 'clandestinos' } });
  assert.equal(payload.username, 'clandestinos.ops');
  assert.equal(payload.embeds.length, 1);
  assert.match(payload.embeds[0].title, /Guerra terminada/);
  const text = JSON.stringify(payload.embeds[0]);
  assert.match(text, /MVP/);
  assert.match(text, /Top 3 ataques|Mejores ataques/);
  assert.match(text, /Gamma/);
  assert.ok(text.includes('\u200E'));
  assert.ok(text.includes('\u2068'));
});
```

- [ ] **Step 2: Run** `node --test tests/war-highlight.test.mjs`  
  Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implement** `scripts/lib/war-highlight.mjs`

```js
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
```

- [ ] **Step 4: Run** `node --test tests/war-highlight.test.mjs` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/war-highlight.mjs tests/war-highlight.test.mjs
git commit -m "$(cat <<'EOF'
feat(discord): highlight de guerra (MVP, top ataques, no atacaron)

EOF
)"
```

---

### Task 2: Cablear warEnded → highlight (no informe largo)

**Files:**
- Modify: `scripts/lib/discord-report.mjs`
- Modify: `scripts/discord-report.mjs`
- Modify: `tests/discord-report.test.mjs`

**Interfaces:**
- Consumes: `buildWarHighlightPayload`, `resolveWarsFromSaved` from Task 1
- `runDiscordReport({ …, warEnded, saved = [] })` — si `warEnded` y `saved.length`, postea highlights; si `force` y no warEnded, informe largo

- [ ] **Step 1: Update tests in `tests/discord-report.test.mjs`**

Reemplazar el test `warEnded manda informe aunque la firma no cambie` para esperar **1 embed** cuyo título match `/Guerra terminada/` y description **sin** `70% impacto`, y body con `Mejores ataques`.

Añadir: con `force: true` y `warEnded: false` sigue habiendo 4 embeds (`/Informe/`, Top 3, Análisis, Prospectos).

Pasar `saved: ['20261013-AAAA.json']` y `site.wars` con una guerra `date: '2026-10-13'`.

- [ ] **Step 2: Run** `node --test tests/discord-report.test.mjs` — Expected: FAIL en el test warEnded.

- [ ] **Step 3: Implement wiring**

En `runDiscordReport`:
- Aceptar `saved = []`.
- Si `warEnded && saved.length`:
  - Si no `webhookUrl` → `{ posted: false, reason: 'no-webhook' }`.
  - `wars = resolveWarsFromSaved(site, saved)`.
  - Por cada war: `buildWarHighlightPayload(war, { clan: site.clan })` → POST.
  - Si al menos un POST ok: actualizar `state` signature/`postedAt` como hoy; `reason: 'war-ended'`.
  - Si todos fallan: no actualizar state.
  - **No** usar `buildReportPayload` en este camino.
- Si `force` (sin depender de warEnded para el payload largo): comportamiento actual con `buildReportPayload`.
- Si `warEnded` pero `saved` vacío: no enviar highlight (idle / unchanged según firma); no spamear informe largo.

En `scripts/discord-report.mjs`:
```js
const saved = Array.isArray(lastFetch.saved) ? lastFetch.saved : [];
const warEnded = saved.length > 0;
const out = await runDiscordReport({ site, state, webhookUrl, force, warEnded, saved });
```

Quitar de `buildReportPayload` el título/description especiales de `warEnded` si ya no se usan en ese camino (dejar `warEnded` param solo si aún se pasa; preferible dejar informe siempre con título “Informe”).

- [ ] **Step 4: Run** `node --test tests/discord-report.test.mjs tests/war-highlight.test.mjs` — PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/discord-report.mjs scripts/discord-report.mjs tests/discord-report.test.mjs
git commit -m "$(cat <<'EOF'
feat(discord): warEnded envía highlight corto en lugar del informe

EOF
)"
```

---

### Task 3: Docs + suite completa

**Files:**
- Modify: `CLAUDE.md` (bloque Discord)
- Modify: `README.md` (línea del informe)

- [ ] **Step 1: Docs** — indicar que al terminar guerra se envía highlight (MVP + top ataques + no atacaron); informe completo solo con `enviar_informe`.

- [ ] **Step 2: Run** `node --test tests/` — Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: warEnded Discord = highlight corto

EOF
)"
```

---

### Task 4: Verificación manual

- [ ] **Step 1:** Local con mock o `DISCORD_SEND_REPORT` no debe mandar highlight; simular `data/last-fetch.json` con un `saved` real del repo + webhook de prueba, o `workflow_dispatch` tras una guerra nueva.
- [ ] **Step 2:** Confirmar en Discord: 1 embed, sin análisis/prospectos; nombres árabes alineados a la izquierda.
- [ ] **Step 3:** `enviar_informe` sigue mandando los 4 embeds del informe.

---

## Spec coverage (self-review)

| Spec | Task |
|------|------|
| Resultado / MVP / Top 3 ataques / No atacaron | Task 1 |
| LTR/FSI | Task 1 |
| Trigger saved / un post por saved | Task 2 |
| force = informe largo | Task 2 |
| Docs | Task 3 |
| Manual | Task 4 |
