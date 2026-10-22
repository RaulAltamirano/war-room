#!/usr/bin/env node
/**
 * Register (overwrite) guild slash commands for clandestinos.ops.
 *
 * Required env:
 *   DISCORD_BOT_TOKEN
 *   DISCORD_APPLICATION_ID
 *   DISCORD_GUILD_ID
 */
import { COMMAND_DEFINITIONS } from '../src/commands.js';

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing env ${name}`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const token = required('DISCORD_BOT_TOKEN');
  const appId = required('DISCORD_APPLICATION_ID');
  const guildId = required('DISCORD_GUILD_ID');

  const url = `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(COMMAND_DEFINITIONS),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`Discord API ${res.status}: ${text}`);
    process.exit(1);
  }

  const body = JSON.parse(text);
  console.log(`Registered ${body.length} guild command(s) on ${guildId}:`);
  for (const cmd of body) {
    console.log(`  /${cmd.name}  (${cmd.id})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
