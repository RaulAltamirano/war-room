import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDiscordBitacora, runDiscordWars } from './lib/discord-wars.mjs';

export { runDiscordWars, formatWarDiscord, formatBitacoraDiscord, warsToAnnounce } from './lib/discord-wars.mjs';

function truthy(v) {
  return v === '1' || v === 'true' || v === 'yes';
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const site = JSON.parse(await readFile(path.join(root, 'data/site.json'), 'utf8'));
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL || '';

  if (truthy(process.env.DISCORD_SEND_BITACORA)) {
    await runDiscordBitacora({
      wars: site.wars || [],
      clanName: site.clan?.name || 'clandestinos',
      webhookUrl,
    });
  }

  const statePath = path.join(root, 'data/discord-wars.json');
  let state = { bootstrapped: false, wars: {} };
  try {
    state = JSON.parse(await readFile(statePath, 'utf8'));
  } catch {
    /* empty */
  }
  const out = await runDiscordWars({
    wars: site.wars || [],
    state,
    webhookUrl,
  });
  if (out.bootstrapped || out.posted > 0) {
    await writeFile(statePath, `${JSON.stringify(out.state, null, 2)}\n`);
  }
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === self) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
