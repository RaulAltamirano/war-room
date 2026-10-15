#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildProspectsPayload, runDiscordProspects } from './lib/discord-report.mjs';

function truthy(v) {
  return v === '1' || v === 'true' || v === 'yes';
}

function printBriefing(briefing) {
  const out = briefing.trend.out;
  console.log(`Prospectos · próxima guerra (${briefing.prospects.length})`);
  if (out.length) {
    console.log(`Fuera: ${out.map((x) => `${x.n} (${x.miss}/${x.pos})`).join(', ')}`);
  }
  console.log('');
  for (const p of briefing.prospects) {
    console.log(`${String(p.rank).padStart(2)}. ${p.n} · ${p.score}`);
  }
}

export async function main(opts = {}) {
  const root = opts.root || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const site = JSON.parse(await readFile(path.join(root, 'data/site.json'), 'utf8'));
  const force = opts.force ?? truthy(process.env.DISCORD_SEND_PROSPECTS);
  const { briefing } = buildProspectsPayload(site);
  printBriefing(briefing);
  return runDiscordProspects({
    site,
    webhookUrl: opts.webhookUrl ?? process.env.DISCORD_WEBHOOK_URL ?? '',
    force,
    fetchImpl: opts.fetchImpl || fetch,
    log: opts.log || console.log,
  });
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === self) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
