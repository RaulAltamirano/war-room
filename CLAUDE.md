# Bitácora de guerras

Sitio estático (GitHub Pages) del clan `#2RGC02RYC`. No hay servidor ni formularios: la página solo lee `data/site.json`.

## Flujo

`scripts/fetch.mjs` llama a `https://cocproxy.royaleapi.dev/v1` con `Authorization: Bearer` desde `COC_API_TOKEN`. La IP autorizada de la llave es `45.79.218.79`. Un 404 de `leaguegroup` es normal fuera de temporada. 403, 429 y 5xx no borran `data/`: 429 y 5xx reintentan una vez; cualquier fallo termina sin escribir.

Cada guerra terminada se guarda una sola vez en `data/raw/YYYYMMDD-<tagRivalSin#>.json` (`startTime` en UTC). En CWL el JSON lleva `warTag`. `#0` se ignora. El lado del clan es el que tenga tag `#2RGC02RYC`, venga en `clan` o en `opponent`.

`scripts/build.mjs` une `data/raw`, `data/legacy-wars.json` (guerra del 1 oct, sin JSON crudo), `data/clan.json` y `data/prospects.json`. La ficha sale de `fromApi` en `scripts/lib/normalize.mjs`. El formato de cada guerra es el del antiguo `<script id="state">`: `[nombre, rol, 15 números]`. El rol sale del `memberList` por tag (`leader→L`, `coLeader→C`, `admin→E`, `member→M`).

`attacksPerMember` manda. Si falta: 1 cuando hay `warTag`, 2 si es guerra normal. Las cuatro guerras migradas traen `attacksPerMember: 1` porque el export no lo incluía y son de liga.

Los 15 números se calculan solo con los ataques del clan, en orden de `order`. La página sigue haciendo ranking, top 3 y «fuera de guerra»; no cambies esas reglas ni el diseño de `index.html`.

Nombres exactos, sin minúsculas. El historial se une por tag. Conocidos: `Joshua` `#GPRY08G8G`, `joshua` `#GGUV8U2LQ`, `JOSHUA` `#R8CVPGJQC`.

No subas el token. No uses `badgeUrls` ni logos de Supercell.
