# Discord: highlight al terminar una guerra

## Objetivo
Cuando una guerra termina y se guarda en `data/raw`, Discord recibe un **mensaje corto de esa guerra** (resultado + lo destacable), no el informe de bitácora (Top 3 acumulado, análisis, prospectos).

## Alcance v1
- Un solo embed por guerra terminada recién guardada.
- Contenido, en este orden:
  1. **Resultado** — fecha corta · rival · Victoria/Derrota/Empate · estrellas `us-them`.
  2. **MVP** — mayor impacto (`stats[0]`) en *esta* guerra. El impacto de un ataque perfecto satura en 100, así que el empate sigue: estrellas totales de sus ataques, luego estrellas nuevas (`stats[2]`), luego destrucción total de `attacks`, luego nombre.
  3. **Top 3 ataques** — todos los ataques del clan en la guerra (`members[].attacks` = `[estrellas, destrucción, order]`), orden: estrellas ↓, destrucción ↓, order ↑; mostrar hasta 3 con nombre del atacante.
  4. **No atacaron** — miembros de *esta* guerra con `unused === pos` (`stats[4] === stats[14]` y `pos > 0`); si ninguno: “Todos atacaron.”
- Nombres con aislamiento LTR/FSI (mismo criterio que ban-zones / prospectos) para RTL.
- Username: `clandestinos.ops`.
- Trigger: el mismo que hoy para informe por guerra nueva (`data/last-fetch.json` con `saved.length > 0` / `warEnded`), pero el payload es el highlight, no `buildReportPayload` completo.

## Fuera de alcance v1
- Análisis ±10, Top 3 de bitácora, prospectos, fórmula 70/30 en este mensaje.
- Cambiar el informe a demanda (`DISCORD_SEND_REPORT` / `enviar_informe`): sigue siendo el informe completo actual.
- Editar o borrar mensajes previos en Discord.
- Anunciar guerras que ya existían en `raw/` (solo archivos nuevos en ese fetch).

## Datos
Fuente: tras `build`, `site.wars`. Cada nombre en `last-fetch.saved` (`YYYYMMDD-<tagRival>.json`) se resuelve a una guerra de `site` por `date` + rival (tag del raw o nombre); si no hay match inequívoco, se usa la guerra de `site.wars` con esa `date` más reciente.

Campos usados por miembro:
- `m[0]` nombre, `m[2]` stats (impacto en `[0]`, unused `[4]`, pos `[14]`), `m[5]` ataques `[[stars, destruction, order], …]`.

## Integración
- Nuevo helper (p. ej. `scripts/lib/war-highlight.mjs`): `buildWarHighlightPayload(war, { clan })`.
- En `discord-report`, por cada archivo en `saved` (y los que sigan en `pendingHighlights`) se postea un highlight. El informe de 4 embeds no sale por un cambio de firma.
- Cada archivo se marca en `highlights` solo si su post fue OK. Un fallo deja ese archivo en `pendingHighlights` para la corrida siguiente. Un OK no cubre a los demás.
- `force` / `DISCORD_SEND_REPORT` manda el informe largo y, si hay highlights pendientes, también esos highlights.
- La lista «No atacaron» se corta por líneas, con «…y N más», para no pasar el límite de 1024 del campo.
- Secreto: `DISCORD_WEBHOOK_URL`. Sin URL → skip. HTTP no OK o error de red → no marcar ese ítem (reintento luego). El paso de Discord en Actions es `continue-on-error` para que un fallo no impida commitear `data/raw`.

## Fallos
- Guerra sin miembros / sin ataques: MVP y Top 3 ataques muestran vacío razonable (`_Sin datos_`); resultado igual se publica si hay rival/estrellas.
- Varias guerras nuevas en un fetch: un highlight por guerra guardada (orden por fecha), o uno solo por la más reciente — **v1: una por cada `saved`**, en orden de guardado.

## Pruebas
- Unit: fixture de una guerra con varios ataques → Top 3 ataques y MVP esperados.
- Unit: alguien con `unused === pos` aparece en “No atacaron”; si todos atacaron, texto fijo.
- Unit: `warEnded` usa highlight; `force` sin warEnded usa informe de 4 embeds.
- Nombre RTL aislado en las líneas del highlight.

## Criterio de listo
Al guardar un `warEnded`, Discord muestra un embed corto (resultado, MVP, Top 3 ataques, no atacaron); el informe largo solo sale con envío forzado a demanda.
