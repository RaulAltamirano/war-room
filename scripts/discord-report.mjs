import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDiscordReport } from './lib/discord-report.mjs';

function truthy(v) {
  return v === '1' || v === 'true' || v === 'yes';
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const site = JSON.parse(await readFile(path.join(root, 'data/site.json'), 'utf8'));
  const statePath = path.join(root, 'data/discord-report.json');
  let state = { bootstrapped: false, signature: '', postedAt: null };
  try {
    state = JSON.parse(await readFile(statePath, 'utf8'));
  } catch {
    /* empty */
  }

  const out = await runDiscordReport({
    site,
    state,
    webhookUrl: process.env.DISCORD_WEBHOOK_URL || '',
    force: truthy(process.env.DISCORD_SEND_REPORT),
    pageUrl: process.env.BITACORA_URL || 'https://raulaltamirano.github.io/war-room/',
  });

  if (out.reason === 'bootstrap' || out.posted) {
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
