import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  closedMonthKey,
  discordContent,
  scoreMonth,
  shouldPost,
  warsInMonth,
} from './lib/monthly-top.mjs';

export async function runDiscordMonthly({
  site,
  awards,
  now = new Date(),
  webhookUrl,
  fetchImpl = fetch,
  log = console.log,
}) {
  const monthKey = closedMonthKey(now);
  if (!shouldPost(awards, monthKey)) {
    log(`Discord: ${monthKey} ya anunciado.`);
    return { posted: false, monthKey, reason: 'already' };
  }
  const monthWars = warsInMonth(site.wars || [], monthKey);
  const result = scoreMonth(monthWars, site.roster || []);
  if (!result) {
    log(`Discord: sin guerras en ${monthKey}; no se anuncia.`);
    return { posted: false, monthKey, reason: 'empty' };
  }
  if (!webhookUrl) {
    log('Discord: falta DISCORD_WEBHOOK_URL; se omite el anuncio.');
    return { posted: false, monthKey, reason: 'no-webhook' };
  }
  const content = discordContent(result, monthKey);
  const res = await fetchImpl(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    log(`Discord: webhook respondió ${res.status}; no se marca el mes.`);
    return { posted: false, monthKey, reason: 'http', status: res.status };
  }
  awards[monthKey] = {
    winner: result.winner,
    score: result.score,
    top3: result.top3,
    postedAt: new Date().toISOString(),
  };
  log(`Discord: anunciado Top 1 ${monthKey} → ${result.winner}.`);
  return { posted: true, monthKey, result };
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
  });
  if (out.posted) {
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
