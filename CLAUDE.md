# Bitácora de guerras

Sitio estático (GitHub Pages) del clan `#2RGC02RYC`. No hay servidor ni formularios: la página solo lee `data/site.json`.

## Flujo

`scripts/fetch.mjs` llama a `https://cocproxy.royaleapi.dev/v1` con `Authorization: Bearer` desde `COC_API_TOKEN`. La IP autorizada de la llave es `45.79.218.79`. Un 404 de `leaguegroup` es normal fuera de temporada. 403, 429 y 5xx no borran `data/`: 429 y 5xx reintentan una vez; cualquier fallo termina sin escribir.

Cada guerra terminada se guarda una sola vez en `data/raw/YYYYMMDD-<tagRivalSin#>.json` (`startTime` en UTC). En CWL el JSON lleva `warTag`. `#0` se ignora. El lado del clan es el que tenga tag `#2RGC02RYC`, venga en `clan` o en `opponent`.

`scripts/build.mjs` une `data/raw` y `data/clan.json`. La ficha sale de `fromApi` en `scripts/lib/normalize.mjs`. El formato de cada miembro en guerra es `[nombre, rol, 15 números, th, mapPosition, ataques]` donde `ataques` es `[[estrellas, destrucción, order], …]`. El rol sale del `memberList` por tag (`leader→L`, `coLeader→C`, `admin→E`, `member→M`). Iconos de TH propios; no uses `badgeUrls` ni arte de Supercell.

`attacksPerMember` manda. Si falta: 1 cuando hay `warTag`, 2 si es guerra normal. Las guerras de liga migradas traen `attacksPerMember: 1` porque el export no lo incluía.

Los 15 números se calculan solo con los ataques del clan, en orden de `order`.

## Página

- **Top 3 / ranking / prospectos:** 70% impacto de guerra + 30% donaciones (normalizadas al máximo del grupo); la liga de clanes (`liga` / 1 ataque) pesa el doble en el promedio de impacto; empate: estrellas ↓, neto ↓, sin usar ↑.
- **Próxima guerra:** quienes pelearon ≥1 guerra y no están «Fuera de guerra» (≥2 ataques sin usar y ≥50%).
- **Análisis:** ±10 de impacto (últimas 2 vs anteriores) con motivo corto `+12 · 70 → 95`; fuera con `X de Y sin usar`.
- No rediseñes el layout de `index.html`.

Nombres exactos, sin minúsculas. El historial se une por tag. Conocidos: `Joshua` `#GPRY08G8G`, `joshua` `#GGUV8U2LQ`, `JOSHUA` `#R8CVPGJQC`.

No subas el token. En el estandarte sí va el `badge` del clan (API). Sigue sin usar `iconUrls` ni arte de TH/rivales de Supercell.

## Discord

Secreto `DISCORD_WEBHOOK_URL`. Tras el build:

- `scripts/discord-report.mjs` → embeds Top 3 + análisis + prospectos. Se envía cuando `fetch` guarda una guerra `warEnded` (`data/last-fetch.json`, no se commitea) o con `DISCORD_SEND_REPORT`. Estado en `data/discord-report.json`.
- `scripts/discord-monthly.mjs` → Top 1 del mes cerrado Mexico City (`data/discord-awards.json`).

Sin URL → skip. Fallo HTTP → no marca ese ítem (reintento luego). No spamear una guerra por mensaje.
