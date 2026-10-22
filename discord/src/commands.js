import { buildBanZonesPayload } from '../../scripts/lib/ban-zones.mjs';
import { buildProspectsPayload, buildReportPayload } from '../../scripts/lib/discord-report.mjs';
import { discordPassRulesPayload, monthKeyInZone } from '../../scripts/lib/monthly-top.mjs';

/** Discord permission: Manage Guild */
export const MANAGE_GUILD = String(1n << 5n);

/**
 * Guild slash command definitions (English names/descriptions).
 * Embed bodies remain Spanish for the clan channel.
 */
export const COMMAND_DEFINITIONS = [
  {
    name: 'report',
    description: 'Post the full war briefing (Top 3, analysis, lineup).',
    type: 1,
    default_member_permissions: MANAGE_GUILD,
    dm_permission: false,
  },
  {
    name: 'lineup',
    description: 'Post the suggested war lineup for the next war.',
    type: 1,
    default_member_permissions: MANAGE_GUILD,
    dm_permission: false,
  },
  {
    name: 'discipline',
    description: 'Post red / grey war-discipline zones.',
    type: 1,
    default_member_permissions: MANAGE_GUILD,
    dm_permission: false,
  },
  {
    name: 'pass',
    description: 'Post battle-pass rules for the current Mexico City month.',
    type: 1,
    default_member_permissions: MANAGE_GUILD,
    dm_permission: false,
  },
];

/**
 * Build Discord message embeds for a slash command.
 * @param {string} name
 * @param {object} site
 * @param {{ now?: Date }} [opts]
 * @returns {{ embeds: object[] } | { content: string, flags?: number }}
 */
export function resolveCommand(name, site, { now = new Date() } = {}) {
  switch (name) {
    case 'report':
      return { embeds: buildReportPayload(site).payload.embeds };
    case 'lineup':
      return { embeds: buildProspectsPayload(site).payload.embeds };
    case 'discipline':
      return { embeds: buildBanZonesPayload(site).payload.embeds };
    case 'pass':
      return { embeds: discordPassRulesPayload(monthKeyInZone(now)).embeds };
    default:
      return {
        content: `Unknown command: \`${name}\`.`,
        flags: 64,
      };
  }
}

export function memberHasAllowedRole(member, allowedRoleIds) {
  if (!allowedRoleIds?.length) return true;
  const roles = new Set(member?.roles || []);
  return allowedRoleIds.some((id) => roles.has(id));
}

export function parseAllowedRoleIds(raw) {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
