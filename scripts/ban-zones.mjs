#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { banZones, runDiscordBanZones } from './lib/ban-zones.mjs';

function truthy(v) {
  return v === '1' || v === 'true' || v === 'yes';
}

function printZones(zones) {
  console.log(`Zona roja (${zones.red.length})`);
  for (const x of zones.red) {
    console.log(`  ${x.n} · ${x.streak} seguidas · ${x.miss}/${x.pos}`);
  }
  console.log(`Zona gris (${zones.grey.length})`);
  for (const x of zones.grey) {
    console.log(`  ${x.n} · ${x.miss}/${x.pos}${x.lastFull ? ' · última sin atacar' : ''}`);
  }
}

export async function main(opts = {}) {
  const root = opts.root || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const site = JSON.parse(await readFile(path.join(root, 'data/site.json'), 'utf8'));
  const force = opts.force ?? truthy(process.env.DISCORD_SEND_BAN_ZONES);
  const zones = banZones(site.wars || [], site.roster || []);
  printZones(zones);
  return runDiscordBanZones({
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
