# Bitácora de guerras — clandestinos

Página estática del clan `#2RGC02RYC`. GitHub Actions consulta la API de Clash of Clans cada 30 minutos, guarda las guerras terminadas y publica `data/site.json`. La llave no sale de los secretos del repositorio.

## Editar los prospectos

`data/prospects.json` es una lista manual. Ábrela en GitHub, cambia los nombres (tal cual, sin pasarlos a minúsculas: `joshua`, `Joshua` y `JOSHUA` son tres jugadores) y guarda el archivo en `main`. El workflow se dispara solo.

## Forzar una actualización

Actions → **Actualizar bitácora** → **Run workflow**.

## Primera vez

1. En [developer.clashofclans.com](https://developer.clashofclans.com), crea una llave con la IP `45.79.218.79`.
2. En el repositorio: Settings → Secrets and variables → Actions → `COC_API_TOKEN`.
3. Settings → Pages → Source: **GitHub Actions**.
4. Settings → Actions → General → Workflow permissions → **Read and write permissions**.

## En local

```bash
node --test tests/
node scripts/build.mjs
python -m http.server
```

Con `COC_API_TOKEN` en el entorno, `node scripts/fetch.mjs` baja lo que falte. Si el archivo de una guerra ya existe, no se vuelve a escribir. Un token inválido no modifica `data/`.
