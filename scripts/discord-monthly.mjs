import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  closedMonthKey,
  discordMonthlyPayload,
  monthKeyInZone,
  scoreMonth,
  shouldPost,
  warsInMonth,
} from './lib/monthly-top.mjs';

function truthy(v) {
  return v === '1' || v === 'true' || v === 'yes';
}

export async function runDiscordMonthly({
  site,
  awards,
  now = new Date(),
  webhookUrl,
  force = false,
  fetchImpl = fetch,
  log = console.log,
}) {
  const preview = !!force;
  const monthKey = preview ? monthKeyInZone(now) : closedMonthKey(now);
  const monthWars = warsInMonth(site.wars || [], monthKey);
  const result = scoreMonth(monthWars, site.roster || []);

  if (!preview && !shouldPost(awards, monthKey)) {
    log(`Discord: ${monthKey} ya anunciado.`);
    return { posted: false, monthKey, reason: 'already' };
  }
  if (!result) {
    log(`Discord: sin guerras en ${monthKey}; no se anuncia.`);
    return { posted: false, monthKey, reason: 'empty' };
  }
  if (!webhookUrl) {
    log('Discord: falta DISCORD_WEBHOOK_URL; se omite el anuncio.');
    return { posted: false, monthKey, reason: 'no-webhook' };
  }

  const payload = discordMonthlyPayload(result, monthKey, { preview });
  const res = await fetchImpl(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    log(`Discord: webhook respondió ${res.status}; no se marca el mes.`);
    return { posted: false, monthKey, reason: 'http', status: res.status };
  }

  if (!preview) {
    awards[monthKey] = {
      winner: result.winner,
      score: result.score,
      top3: result.top3,
      postedAt: new Date().toISOString(),
    };
  }
  log(`Discord: ${preview ? 'vista previa' : 'anunciado'} Top 1 ${monthKey} → ${result.winner}.`);
  return { posted: true, monthKey, result, preview };
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const site = JSON.parse(await readFile(path.join(root, 'data/site.json'), 'utf8'));
  const awardsPath = path.join(root, 'data/discord-awards.json');
  let awards = {};
  try {
    awards = JSON.parse(await readFile(awardsPath, 'utf8'));
  } catch {
    awards = {};
  }
  const out = await runDiscordMonthly({
    site,
    awards,
    webhookUrl: process.env.DISCORD_WEBHOOK_URL || '',
    force: truthy(process.env.DISCORD_SEND_MONTHLY),
  });
  if (out.posted && !out.preview) {
    await writeFile(awardsPath, `${JSON.stringify(awards, null, 2)}\n`);
  }
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === self) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
