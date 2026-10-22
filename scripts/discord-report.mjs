import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDiscordReport } from './lib/discord-report.mjs';

function truthy(v) {
  return v === '1' || v === 'true' || v === 'yes';
}

async function readLastFetch(root) {
  try {
    return JSON.parse(await readFile(path.join(root, 'data/last-fetch.json'), 'utf8'));
  } catch {
    return { saved: [], skipped: [] };
  }
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

  const lastFetch = await readLastFetch(root);
  const saved = Array.isArray(lastFetch.saved) ? lastFetch.saved : [];
  const warEnded = saved.length > 0;

  const out = await runDiscordReport({
    site,
    state,
    webhookUrl: process.env.DISCORD_WEBHOOK_URL || '',
    force: truthy(process.env.DISCORD_SEND_REPORT),
    warEnded,
    saved,
  });

  if (out.state && JSON.stringify(out.state) !== JSON.stringify(state)) {
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
