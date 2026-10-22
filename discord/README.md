# clandestinos.ops — Discord slash commands

HTTP interactions endpoint for guild slash commands. Replaces manual GitHub Actions “send now” clicks for leaders. The cron webhook pipeline (war-ended highlights, monthly award file) stays unchanged.

| Command        | Result                                      |
|----------------|---------------------------------------------|
| `/war`         | Who should join the next war (lineup)       |
| `/scout`       | Active-war attack plan (mirror/alt + army)  |
| `/clan`        | War record, streak, league                  |
| `/top`         | Cumulative bitácora Top 3                   |
| `/report`      | General clan status pulse (trends only)     |
| `/discipline`  | Red / grey discipline zones                 |
| `/pass`        | Battle-pass rules (current Mexico City month) |

`/scout` reads `activeWar` from the latest `fetch` snapshot in `site.json` (preparation / inWar). It does **not** see base layouts — only TH + map position.

Command **names and descriptions are English**. Embed **copy stays Spanish** for the clan channel.

## Prerequisites

GitHub / Cloudflare secrets (never commit these):

| Name | Where | Purpose |
|------|--------|---------|
| `DISCORD_BOT_TOKEN` | local / CI only | Register guild commands |
| `DISCORD_APPLICATION_ID` | Worker secret + register | App id (Developer Portal) |
| `DISCORD_PUBLIC_KEY` | Worker secret | Ed25519 verify |
| `DISCORD_GUILD_ID` | register only | Clan Discord server id |
| `SITE_JSON_URL` | Worker var | Built `data/site.json` URL |
| `ALLOWED_ROLE_IDS` | Worker secret (optional) | Extra role gate (comma-separated) |

Default `SITE_JSON_URL` points at the `main` branch raw file. Override if you use Pages or another CDN.

## Deploy (Cloudflare Workers)

```bash
cd discord
npm install
npx wrangler login
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put DISCORD_APPLICATION_ID
# optional: npx wrangler secret put ALLOWED_ROLE_IDS
npm run deploy
```

Copy the Worker URL into **Discord Developer Portal → General → Interactions Endpoint URL**. Discord sends a `PING`; a verified `PONG` is required for the URL to stick.

## Register guild commands

```bash
cd discord
export DISCORD_BOT_TOKEN=...
export DISCORD_APPLICATION_ID=...
export DISCORD_GUILD_ID=...   # Server Settings → Widget / snowflake copy
npm run register
```

Guild commands appear within seconds. Only members with **Manage Server** see them by default (`default_member_permissions`).

## Local checks

```bash
node --test tests/discord-interactions.test.mjs
# or from discord/: npm test
```

## Design

See [`docs/superpowers/specs/2026-10-22-discord-slash-commands-design.md`](../docs/superpowers/specs/2026-10-22-discord-slash-commands-design.md).
