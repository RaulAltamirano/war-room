# Discord slash commands (HTTP interactions)

## Goal

Let clan leaders run the same Discord posts as the GitHub Actions manual inputs, from Discord, via slash commands — without keeping a Gateway bot online.

## Non-goals (v1)

- Replacing the cron webhook pipeline (war-ended highlights, monthly Top 1 award file).
- Gateway / message-content intents.
- Public install; DMs; multi-clan tenancy.
- Writing `data/discord-awards.json` or other git state from the interaction service.

## Architecture

```
Discord  --POST signed interaction-->  Cloudflare Worker
                                         |-- verify Ed25519 (public key)
                                         |-- PING -> PONG
                                         |-- slash -> defer (type 5)
                                         |-- fetch site.json (Pages/raw URL)
                                         |-- reuse scripts/lib payload builders
                                         '-- PATCH interaction follow-up embeds
```

- **Transport:** HTTP interactions endpoint (not Gateway).
- **Commands:** guild-scoped (instant updates; private clan app).
- **AuthZ:** `default_member_permissions = MANAGE_GUILD` so Discord hides commands from regular members. Optional `ALLOWED_ROLE_IDS` env for a second server-side check.
- **Data:** read-only `SITE_JSON_URL` (built artifact). No CoC API calls from the Worker.
- **User-facing embeds:** stay Spanish (clan channel). Code, command names, docs: English.

## Commands

| Command       | Effect                                      | Mirrors workflow input      |
|---------------|---------------------------------------------|-----------------------------|
| `/top`        | Live Top 3 podium embed                     | _(slash only)_              |
| `/report`     | 4-embed war briefing                        | `enviar_informe`            |
| `/lineup`     | Kickoff alignment embed                     | `enviar_prospectos`         |
| `/discipline` | Red / grey discipline embed                 | `enviar_zonas_ban`          |
| `/pass`       | Battle-pass rules for the current MX month  | `enviar_pase`               |

## Security

1. Reject any request that fails Ed25519 verification (`X-Signature-Ed25519` + `X-Signature-Timestamp` over raw body) with **401**.
2. Never log bot token or public key.
3. Secrets: `DISCORD_PUBLIC_KEY`, `DISCORD_APPLICATION_ID`, `SITE_JSON_URL`; registration script uses `DISCORD_BOT_TOKEN` + `DISCORD_GUILD_ID` locally/CI only.
4. Interaction follow-ups use the interaction token (no bot token required on the hot path).

## Failure behavior

- Invalid signature → 401 (Discord may revoke the endpoint URL if this is wrong).
- Unknown command → ephemeral error on follow-up.
- `site.json` fetch failure → follow-up explaining data unavailable.
- Worker must always answer PING with `{ "type": 1 }` within Discord’s validation window.

## Repo layout

- `discord/` — Worker, register script, package metadata.
- `scripts/lib/*` — existing embed builders (shared).
- `docs/superpowers/specs/2026-10-22-discord-slash-commands-design.md` — this file.

## Rollout

1. Deploy Worker; set secrets/vars.
2. Paste Worker URL into Developer Portal → Interactions Endpoint URL (Discord sends PING).
3. Run `npm run register` in `discord/` with bot token + guild id.
4. Leaders use slash commands in the clan guild.

## Ready when

- Portal accepts the interactions URL.
- Guild shows the four commands.
- A user with Manage Server can run each command and get the expected embeds.
- Invalid signatures never return 200.
