# Discord Top 1 mensual — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Anunciar en Discord (webhook) el Top 1 del mes calendario anterior (America/Mexico_City) con la fórmula 70/30, una sola vez por mes.

**Architecture:** Tras `build.mjs`, un script lee `data/site.json` + roster, calcula el mes cerrado, y si no está en `data/discord-awards.json` hace POST al webhook y persiste el award. El workflow hace commit de `data/` como hoy.

**Tech Stack:** Node 22 ESM, GitHub Actions, Discord Incoming Webhook, `Intl` / timezone Mexico City. Sin dependencias nuevas si se puede.

**Spec:** `docs/superpowers/specs/2026-10-13-discord-monthly-top1-design.md`

## Global Constraints

- Fórmula: 70% impacto + 30% donaciones normalizadas; empate estrellas ↓ neto ↓ sin usar ↑.
- Zona: `America/Mexico_City`; anuncio el día 1+ del mes nuevo para el mes anterior.
- Sin webhook → skip con log, exit 0 (no tumbar fetch CoC).
- Post fallido → no escribir award (reintentar luego).
- Comentarios en código solo si hay invariante no obvio.
- Commits convencionales en español, estilo del repo.

---

### Task 1: Cálculo mensual + awards (TDD)

**Files:**
- Create: `scripts/lib/monthly-top.mjs`
- Create: `tests/monthly-top.test.mjs`
- Modify: `data/discord-awards.json` (inicial `{}`)

- [x] **Step 1: Test fallido** — fixture con 2–3 guerras en octubre 2026 + roster; esperar winner/top3; mes cerrado el 2026-11-01 Mexico City = `2026-10`.
- [x] **Step 2: Run** `node --test tests/monthly-top.test.mjs` — debe fallar.
- [x] **Step 3: Implementar** `closedMonthKey(now)`, `warsInMonth(wars, key)`, `scoreMonth(wars, roster)` exportados.
- [x] **Step 4: Run tests** — pass.
- [x] **Step 5: Commit** `feat: calcula Top 1 mensual 70/30 para Discord`

### Task 2: Script webhook + idempotencia

**Files:**
- Create: `scripts/discord-monthly.mjs`
- Modify: `tests/monthly-top.test.mjs` (o `tests/discord-monthly.test.mjs`)

- [x] **Step 1: Test** — si awards ya tiene la clave, `shouldPost` es false; si no, true; mock `fetch` cuenta 1 POST y escribe awards.
- [x] **Step 2: Implementar** lectura site + awards, POST Discord, escritura awards solo si OK.
- [x] **Step 3: Env** `DISCORD_WEBHOOK_URL`; ausente → log y exit 0.
- [x] **Step 4: Tests pass + commit** `feat: anuncia Top 1 mensual por webhook de Discord`

### Task 3: Workflow + docs

**Files:**
- Modify: `.github/workflows/update.yml`
- Modify: `README.md`, `CLAUDE.md`

- [x] **Step 1: Tras** `build.mjs`, correr `node scripts/discord-monthly.mjs` con `DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}`.
- [x] **Step 2: `git add data`** debe incluir `discord-awards.json`.
- [x] **Step 3: Documentar** secreto y canal webhook en README/CLAUDE.
- [x] **Step 4: `node --test tests/`** completo.
- [x] **Step 5: Commit** `ci: publica el Top 1 mensual en Discord tras el build`

### Task 4: Verificación manual

- [x] Crear webhook en Discord → secret `DISCORD_WEBHOOK_URL`.
- [x] `workflow_dispatch` o dry-run local con URL de prueba.
- [x] Confirmar un solo mensaje y entrada en `data/discord-awards.json`.
