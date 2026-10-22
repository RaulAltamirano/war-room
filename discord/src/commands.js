import { buildBanZonesPayload } from '../../scripts/lib/ban-zones.mjs';
import {
  TOP3_THUMB_ATTACHMENT,
  buildClanPayload,
  buildProspectsPayload,
  buildReportPayload,
  buildTop3Payload,
} from '../../scripts/lib/discord-report.mjs';
import { discordPassRulesPayload, monthKeyInZone } from '../../scripts/lib/monthly-top.mjs';
import { TOP3_FILENAME, TOP3_MIME, top3Bytes } from './top3-thumb.js';

/** Discord permission: Manage Guild */
export const MANAGE_GUILD = String(1n << 5n);

/**
 * Guild slash command definitions (English names/descriptions).
 * Embed bodies remain Spanish for the clan channel.
 */
export const COMMAND_DEFINITIONS = [
  {
    name: 'war',
    description: 'Post who should join the next war (suggested lineup).',
    type: 1,
    default_member_permissions: MANAGE_GUILD,
    dm_permission: false,
  },
  {
    name: 'clan',
    description: 'Post clan war record, streak, league, and bitácora snapshot.',
    type: 1,
    default_member_permissions: MANAGE_GUILD,
    dm_permission: false,
  },
  {
    name: 'top',
    description: 'Post the cumulative bitácora Top 3 (all wars; not last war only).',
    type: 1,
    default_member_permissions: MANAGE_GUILD,
    dm_permission: false,
  },
  {
    name: 'report',
    description: 'Post a general clan status pulse (trends; no war card).',
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
 * @returns {{ embeds: object[], files?: object[] } | { content: string, flags?: number }}
 */
export function resolveCommand(name, site, { now = new Date() } = {}) {
  switch (name) {
    case 'war':
    case 'lineup': // legacy alias if an old registration remains
      return { embeds: buildProspectsPayload(site).payload.embeds };
    case 'clan':
      return { embeds: buildClanPayload(site).payload.embeds };
    case 'top':
      return {
        embeds: buildTop3Payload(site, { thumbUrl: TOP3_THUMB_ATTACHMENT }).payload.embeds,
        files: [
          {
            name: TOP3_FILENAME,
            type: TOP3_MIME,
            bytes: top3Bytes(),
          },
        ],
      };
    case 'report':
      return { embeds: buildReportPayload(site).payload.embeds };
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
