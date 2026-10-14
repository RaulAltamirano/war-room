# Bitácora de guerras — clandestinos

Página estática del clan `#2RGC02RYC`. GitHub Actions consulta la API de Clash of Clans cada 30 minutos, guarda las guerras terminadas y publica `data/site.json`. La llave no sale de los secretos del repositorio.

El Top 3 y la sugerencia de próxima guerra se calculan solos: 70% impacto de guerra + 30% donaciones (relativas al mayor donador del grupo). Empate: estrellas, neto, ataques sin usar. Quien dejó la mitad o más de sus ataques queda fuera.

## Forzar una actualización

Actions → **Actualizar bitácora** → **Run workflow**.

## Discord

Con el secreto `DISCORD_WEBHOOK_URL` el cron publica:

- **Guerra nueva** (cuando se guarda en `data/raw`): rival, resultado, estrellas y top impacto.
- **Top 1 del mes** (día 1, Mexico City): ganador del pase (fórmula 70/30). Entrega del pase a mano.

1. Canal → Integraciones → **Webhook** → URL → secret `DISCORD_WEBHOOK_URL`.
2. Sin secreto el fetch sigue; solo se omiten los avisos.
3. La primera corrida marca el historial actual sin spamear; solo las guerras nuevas se anuncian.
4. Para mandar toda la bitácora ya: Actions → **Actualizar bitácora** → **Run workflow** → marca **Enviar bitácora completa a Discord ahora**.

## Primera vez

1. En [developer.clashofclans.com](https://developer.clashofclans.com), crea una llave con la IP `45.79.218.79`.
2. En el repositorio: Settings → Secrets and variables → Actions → `COC_API_TOKEN` (y opcional `DISCORD_WEBHOOK_URL`).
3. Settings → Pages → Source: **GitHub Actions**.
4. Settings → Actions → General → Workflow permissions → **Read and write permissions**.

## En local

```bash
node --test tests/
node scripts/build.mjs
python -m http.server
```

Con `COC_API_TOKEN` en el entorno, `node scripts/fetch.mjs` baja lo que falte. Si el archivo de una guerra ya existe, no se vuelve a escribir. Un token inválido no modifica `data/`.
