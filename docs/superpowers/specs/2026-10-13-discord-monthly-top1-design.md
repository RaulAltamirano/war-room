# Discord: anuncio mensual del Top 1 (pase)

## Objetivo
Avisar en Discord quién fue Top 1 del mes calendario (America/Mexico_City) para regalar un pase. La entrega del pase es manual; el sistema solo anuncia.

## Alcance v1
- Webhook de Discord (no bot con gateway).
- Misma fórmula que la bitácora: 70% impacto de guerra + 30% donaciones (normalizadas al máximo del grupo con ≥1 guerra en el periodo).
- Solo guerras cuyo `date` (día UTC de `startTime`, como en `site.json`) cae en el mes cerrado.
- Cierre: el día 1 local (Mexico City), anunciar el **mes anterior** si aún no está anunciado.
- Idempotencia en `data/discord-awards.json`.

## Fuera de alcance v1
- Comprar/enviar el pase.
- DMs, roles, suscripciones por persona.
- Editar mensajes previos (salvo no reenviar el mismo mes).

## Datos
Archivo `data/discord-awards.json`:

```json
{
  "2026-10": {
    "winner": "kssto",
    "score": 100,
    "top3": [["kssto", 100], ["Pete Zahut", 82], ["demiur", 71]],
    "postedAt": "2026-11-01T06:05:00.000Z"
  }
}
```

Clave = `YYYY-MM` del mes premiado (zona Mexico City).

## Cálculo
1. Determinar “mes cerrado” = mes calendario anterior en `America/Mexico_City`.
2. Filtrar `site.wars` (o rebuild desde raw) con `war.date` en ese mes.
3. Agregar miembros como en la página; score = `0.7 * impacto + 0.3 * (don/maxDon)*100`.
4. Orden: score ↓, luego estrellas ↓, neto ↓, sin usar ↑, nombre.
5. Si no hay guerras ese mes: no postear (o mensaje “sin guerras”); no escribir award.

## Integración
- Secreto: `DISCORD_WEBHOOK_URL`.
- Script: `scripts/discord-monthly.mjs` (o paso en el workflow tras `build.mjs`).
- Condición: hoy (Mexico City) es día ≥ 1 del mes nuevo **y** no existe clave del mes anterior en `discord-awards.json`.
- Post: embed o texto corto en español, ej.  
  `🏆 Top 1 octubre 2026: **kssto** (100 pts) — se gana el pase del mes.`  
  + Top 3 opcional.
- Tras post OK: escribir/actualizar `data/discord-awards.json` y commit con el resto de `data/` (mismo job del bot).

## Fallos
- Sin webhook: skip con log, no falla el fetch de CoC.
- Webhook 4xx/5xx: no marcar el mes como posted; reintentar en la siguiente corrida.
- Push de datos: mismo `pull --rebase` + reintentos que ya tiene el workflow.

## Pruebas
- Unit: dado wars + roster de un mes fijo → winner y top3 esperados.
- Unit: si el mes ya está en awards → no “postea” (mock fetch).
- Fixture de fecha: simular 1 nov → mes cerrado = octubre.

## Criterio de listo
El 1° de cada mes, tras el cron, Discord muestra un solo anuncio del Top 1 del mes anterior; el archivo de awards queda versionado en el repo.
