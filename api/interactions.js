import { InteractionType, InteractionResponseType, verifyKey } from 'discord-interactions';

const DISCORD_API = 'https://discord.com/api/v10';
const TICKETS_CATEGORY_ID = process.env.TICKETS_CATEGORY_ID || '1452274275552723099';
const CLOSED_CATEGORY_ID = process.env.CLOSED_CATEGORY_ID || '1549979830068580373';
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID || '1452274255294234665';
const TRANSCRIPTS_CHANNEL_ID = process.env.TRANSCRIPTS_CHANNEL_ID || '1540878462305312879';
const VERIFIED_ROLE_ID = process.env.VERIFIED_ROLE_ID || '';
const VOICE_PANEL_CHANNEL_ID = process.env.VOICE_PANEL_CHANNEL_ID || '';
const JOIN_TO_CREATE_VC_ID = process.env.JOIN_TO_CREATE_VC_ID || '';

const VOID_THEME_COLOR = 0x7B2CBF; // Neon Void Purple
const VOID_ACCENT_COLOR = 0x9D4EDD; // Bright Void Lavender

async function discordFetch(endpoint, options = {}) {
  const token = process.env.DISCORD_TOKEN;
  const res = await fetch(DISCORD_API + endpoint, {
    ...options,
    headers: {
      'Authorization': 'Bot ' + token,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error('Discord API Error [' + endpoint + ']:', errText);
    throw new Error('Discord API error: ' + res.status + ' ' + errText);
  }
  return res.json().catch(() => ({}));
}

// 🛡️ Blacklist & Anti-Troll In-Memory Cache
let blacklistCache = null;
let blacklistCacheTime = 0;
let blacklistRoleIdCache = null;

function isStaff(member) {
  if (!member) return false;
  try {
    const permissions = BigInt(member.permissions || '0');
    if ((permissions & 0x8n) === 0x8n) return true;
  } catch (_) {}
  if (member.roles && member.roles.includes(STAFF_ROLE_ID)) return true;
  return false;
}

function parseColorHex(input) {
  if (!input) return VOID_THEME_COLOR;
  const named = {
    purple: 0x7B2CBF,
    violet: 0x9D4EDD,
    darkpurple: 0x240046,
    gold: 0xFEE75C,
    yellow: 0xFEE75C,
    green: 0x57F287,
    emerald: 0x00FFA3,
    teal: 0x1ABC9C,
    blue: 0x5865F2,
    blurple: 0x5865F2,
    red: 0xED4245,
    orange: 0xE67E22,
    white: 0xFFFFFF,
    black: 0x121212,
    cyan: 0x00E5FF
  };
  const clean = input.toLowerCase().trim().replace('#', '');
  if (named[clean]) return named[clean];
  const parsed = parseInt(clean, 16);
  return isNaN(parsed) ? VOID_THEME_COLOR : parsed;
}

const PERM_FLAGS = {
  administrator: 0x8n,
  admin: 0x8n,
  manage_guild: 0x20n,
  manage_channels: 0x10n,
  kick_members: 0x2n,
  kick: 0x2n,
  ban_members: 0x4n,
  ban: 0x4n,
  manage_messages: 0x2000n,
  mute_members: 0x400000n,
  deafen_members: 0x800000n,
  move_members: 0x1000000n,
  manage_nicknames: 0x8000000n,
  manage_roles: 0x10000000n,
  view_audit_log: 0x80n,
  view_channel: 0x400n,
  send_messages: 0x800n,
  embed_links: 0x4000n,
  attach_files: 0x8000n,
  read_message_history: 0x10000n,
  mention_everyone: 0x20000n,
  use_external_emojis: 0x40000n,
  connect: 0x100000n,
  speak: 0x200000n,
  moderate_members: 0x10000000000n,
  timeout: 0x10000000000n
};

function resolvePermissions(input) {
  if (!input) return { bits: '0', label: 'None (0)', list: ['No extra permissions'] };
  const lower = input.toLowerCase().trim();

  if (lower === 'admin' || lower === 'administrator') {
    return {
      bits: '8',
      label: '👑 Administrator (Full Control)',
      list: ['Full Administrator Privileges (All Permissions Granted)']
    };
  }

  if (lower === 'mod' || lower === 'moderator' || lower === 'staff') {
    const bits = PERM_FLAGS.view_channel | PERM_FLAGS.send_messages | PERM_FLAGS.read_message_history |
      PERM_FLAGS.embed_links | PERM_FLAGS.attach_files | PERM_FLAGS.kick_members | PERM_FLAGS.ban_members |
      PERM_FLAGS.manage_messages | PERM_FLAGS.mute_members | PERM_FLAGS.deafen_members | PERM_FLAGS.manage_nicknames |
      PERM_FLAGS.view_audit_log | PERM_FLAGS.moderate_members;
    return {
      bits: bits.toString(),
      label: '🛡️ Staff / Moderator (Full Moderation Suite)',
      list: ['Kick & Ban Members', 'Timeout/Mute', 'Manage & Delete Messages', 'Manage Nicknames', 'View Audit Log', 'Voice Mute & Deafen']
    };
  }

  if (lower === 'member' || lower === 'citizen') {
    const bits = PERM_FLAGS.view_channel | PERM_FLAGS.send_messages | PERM_FLAGS.read_message_history |
      PERM_FLAGS.embed_links | PERM_FLAGS.attach_files | PERM_FLAGS.connect | PERM_FLAGS.speak;
    return {
      bits: bits.toString(),
      label: '🏙️ Citizen (Standard City Access)',
      list: ['View Channels', 'Send Messages', 'Embed Links & Attach Media', 'Connect & Speak in Voice']
    };
  }

  if (lower === 'readonly') {
    const bits = PERM_FLAGS.view_channel | PERM_FLAGS.read_message_history;
    return {
      bits: bits.toString(),
      label: '👁️ Read Only (View Only)',
      list: ['View Channels', 'Read Message History']
    };
  }

  return { bits: '0', label: 'Custom (' + input + ')', list: [input] };
}

// 🛡️ Blacklist helpers
async function getBlacklistRoleId(guildId) {
  if (blacklistRoleIdCache) return blacklistRoleIdCache;
  try {
    const roles = await discordFetch('/guilds/' + guildId + '/roles');
    const found = roles.find(r => r.name.toLowerCase().includes('blacklisted') || r.name.toLowerCase().includes('ticket ban'));
    if (found) {
      blacklistRoleIdCache = found.id;
      return found.id;
    }
  } catch (_) {}
  return null;
}

async function isMemberBlacklisted(guildId, userId, memberRoles = []) {
  const roleId = await getBlacklistRoleId(guildId);
  if (roleId && memberRoles.includes(roleId)) return true;
  if (blacklistCache && (Date.now() - blacklistCacheTime < 300000)) {
    return blacklistCache.has(userId);
  }
  return false;
}

// ----------------------------------------------------
// MAIN ROUTE HANDLER (EDGE / SERVERLESS COMPATIBLE)
// ----------------------------------------------------
export async function POST(request) {
  try {
    const signature = request.headers.get('x-signature-ed25519');
    const timestamp = request.headers.get('x-signature-timestamp');
    const rawBody = await request.text();

    const clientPublicKey = process.env.DISCORD_PUBLIC_KEY;
    if (!clientPublicKey) {
      return new Response(JSON.stringify({ error: 'Missing DISCORD_PUBLIC_KEY' }), { status: 500 });
    }

    const isValid = verifyKey(rawBody, signature, timestamp, clientPublicKey);
    if (!isValid) {
      return new Response('Invalid request signature', { status: 401 });
    }

    const interaction = JSON.parse(rawBody);

    // 1. PING ACK
    if (interaction.type === InteractionType.PING) {
      return new Response(JSON.stringify({ type: InteractionResponseType.PONG }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 2. APPLICATION COMMANDS (SLASH COMMANDS)
    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
      const resp = await handleSlashCommand(interaction);
      return new Response(JSON.stringify(resp), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 3. MESSAGE COMPONENT (BUTTONS & SELECT MENUS)
    if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
      const resp = await handleComponent(interaction);
      return new Response(JSON.stringify(resp), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 4. MODAL SUBMIT
    if (interaction.type === InteractionType.MODAL_SUBMIT) {
      const resp = await handleModalSubmit(interaction);
      return new Response(JSON.stringify(resp), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Interaction handling error:', err);
    return new Response(JSON.stringify({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: '⚠️ **VOID Roleplay Engine Internal Error:** ' + err.message,
        flags: 64
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// ----------------------------------------------------
// SLASH COMMAND DISPATCHER
// ----------------------------------------------------
async function handleSlashCommand(interaction) {
  const { name, options } = interaction.data;

  switch (name) {
    case 'setup-tickets':
      return handleSetupTickets(interaction);
    case 'setup-verify':
      return handleSetupVerify(interaction);
    case 'verify':
      return handleVerifyCommand(interaction);
    case 'setup-voice-panel':
      return handleSetupVoicePanel(interaction);
    case 'vc':
      return handleVCCommand(interaction);
    case 'automod':
      return handleAutoModCommand(interaction);
    case 'city-status':
      return handleCityStatusCommand(interaction);
    case 'channel':
      return handleChannelCommand(interaction);
    case 'role':
      return handleRoleCommand(interaction);
    case 'autorole':
      return handleAutoRoleCommand(interaction);
    case 'blacklist':
      return handleBlacklistCommand(interaction);
    default:
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: 'Unknown slash command.', flags: 64 }
      };
  }
}

// ----------------------------------------------------
// 1. SETUP TICKETS (VOID ROLEPLAY SUPPORT STATION)
// ----------------------------------------------------
async function handleSetupTickets(interaction) {
  if (!isStaff(interaction.member)) {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: '❌ **Access Denied:** Only High Command and Staff can deploy the Support Station.', flags: 64 }
    };
  }

  const targetChannelId = (interaction.data.options && interaction.data.options.find(o => o.name === 'channel')?.value) || interaction.channel_id;

  const embed = {
    title: '🌌 VOID ROLEPLAY — CITIZEN SUPPORT & TICKET STATION',
    description: [
      'Welcome to the official **VOID Roleplay** Assistance & Application Terminal.',
      '',
      'Select a department from the menu below to initialize an official investigation, submit an application, or report an incident to Server Staff.',
      '',
      '**Available Support Departments:**',
      '• 🚨 **Player Report (RDM / VDM / FailRP)** — Report rulebreaks with video clip proof',
      '• ⚖️ **Ban Appeal** — Appeal an active server ban or suspension',
      '• 🏴 **Gang & Faction Registration** — Official syndicate & territory registry',
      '• 🏢 **Business & MLO Proposals** — Commercial enterprises & custom property',
      '• 🐛 **Bug & Glitch Reports** — Report city exploits, vehicle bugs, and script glitches',
      '• ❓ **General City Support** — Character questions, lost items, Tebex / CFX queries',
      '',
      '⚠️ *Trolling tickets or submitting false player reports will result in immediate Discord & City blacklist.*'
    ].join('\n'),
    color: VOID_THEME_COLOR,
    footer: {
      text: 'VOID Roleplay High Command • 24/7 Citizen Support Terminal'
    },
    timestamp: new Date().toISOString()
  };

  const selectMenu = {
    type: 1,
    components: [
      {
        type: 3,
        custom_id: 'ticket_category_select',
        placeholder: '⚡ Choose a Department to open a ticket...',
        options: [
          {
            label: 'Player Report (RDM / VDM / FailRP)',
            value: 'ticket_cat_report',
            description: 'Report rulebreaks with video evidence clip',
            emoji: { name: '🚨' }
          },
          {
            label: 'Ban Appeal',
            value: 'ticket_cat_appeal',
            description: 'Request formal review of an active server ban',
            emoji: { name: '⚖️' }
          },
          {
            label: 'Gang & Faction Registration',
            value: 'ticket_cat_gang',
            description: 'Register gang name, leader, turf, and roster',
            emoji: { name: '🏴' }
          },
          {
            label: 'Business & MLO Proposals',
            value: 'ticket_cat_business',
            description: 'Submit business concept or custom MLO proposal',
            emoji: { name: '🏢' }
          },
          {
            label: 'Bug & Glitch Report',
            value: 'ticket_cat_bug',
            description: 'Report city bugs, mapping glitches, or exploits',
            emoji: { name: '🐛' }
          },
          {
            label: 'General City Support',
            value: 'ticket_cat_support',
            description: 'Character inquiries, general questions, and help',
            emoji: { name: '❓' }
          }
        ]
      }
    ]
  };

  try {
    await discordFetch('/channels/' + targetChannelId + '/messages', {
      method: 'POST',
      body: JSON.stringify({
        embeds: [embed],
        components: [selectMenu]
      })
    });

    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: '✅ **VOID Roleplay Ticket Station successfully deployed to <#' + targetChannelId + '>!**',
        flags: 64
      }
    };
  } catch (err) {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: '❌ **Failed to deploy Ticket Station:** ' + err.message, flags: 64 }
    };
  }
}

// ----------------------------------------------------
// 2. SETUP VERIFICATION (CITIZEN VERIFY STATION)
// ----------------------------------------------------
async function handleSetupVerify(interaction) {
  if (!isStaff(interaction.member)) {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: '❌ **Access Denied:** Only Staff can configure Verification.', flags: 64 }
    };
  }

  const targetChannelId = (interaction.data.options && interaction.data.options.find(o => o.name === 'channel')?.value) || interaction.channel_id;
  const roleOption = interaction.data.options && interaction.data.options.find(o => o.name === 'role')?.value;

  const embed = {
    title: '🛡️ VOID ROLEPLAY — CITIZEN VERIFICATION',
    description: [
      'Welcome to **VOID Roleplay**.',
      '',
      'To access server chat, voice patrol lounges, and whitelist applications, you must verify your identity as an authorized citizen.',
      '',
      '**Rules of Entry:**',
      '1. Follow all FiveM Community Standards and VOID Roleplay rules.',
      '2. No toxic behavior, hate speech, or out-of-character drama.',
      '3. Respect Staff and High Command decisions at all times.',
      '',
      'Click the button below to verify your account and receive the **Citizen** role.'
    ].join('\n'),
    color: VOID_THEME_COLOR,
    footer: {
      text: 'VOID Roleplay Gatekeeper • Anti-Bot & Raid Security'
    },
    timestamp: new Date().toISOString()
  };

  const actionRow = {
    type: 1,
    components: [
      {
        type: 2,
        style: 3, // Success Green
        label: 'Verify Citizen Status',
        custom_id: roleOption ? ('verify_citizen_btn:' + roleOption) : 'verify_citizen_btn',
        emoji: { name: '✅' }
      }
    ]
  };

  try {
    await discordFetch('/channels/' + targetChannelId + '/messages', {
      method: 'POST',
      body: JSON.stringify({
        embeds: [embed],
        components: [actionRow]
      })
    });

    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: '✅ **VOID Roleplay Citizen Verification Station deployed to <#' + targetChannelId + '>!**',
        flags: 64
      }
    };
  } catch (err) {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: '❌ **Failed to deploy Verification Station:** ' + err.message, flags: 64 }
    };
  }
}

// ----------------------------------------------------
// /verify Command
// ----------------------------------------------------
async function handleVerifyCommand(interaction) {
  const guildId = interaction.guild_id;
  const userId = interaction.member?.user?.id;

  try {
    const roles = await discordFetch('/guilds/' + guildId + '/roles');
    const citizenRole = roles.find(r => r.name.toLowerCase() === 'citizen' || r.name.toLowerCase() === 'verified');

    if (!citizenRole) {
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: '⚠️ **Citizen role not found.** Staff must create a role named `Citizen` or run `/setup-verify role:@Role`.',
          flags: 64
        }
      };
    }

    await discordFetch('/guilds/' + guildId + '/members/' + userId + '/roles/' + citizenRole.id, {
      method: 'PUT'
    });

    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: '✅ **Verification Complete!** You have been granted the <@&' + citizenRole.id + '> role. Welcome to VOID Roleplay!',
        flags: 64
      }
    };
  } catch (err) {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: '❌ **Verification failed:** ' + err.message, flags: 64 }
    };
  }
}

// ----------------------------------------------------
// 3. SETUP VOICE PANEL (PATROL & SQUAD VOICE CONTROLS)
// ----------------------------------------------------
async function handleSetupVoicePanel(interaction) {
  if (!isStaff(interaction.member)) {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: '❌ **Access Denied:** Only Staff can deploy the Patrol Voice Control Panel.', flags: 64 }
    };
  }

  const targetChannelId = (interaction.data.options && interaction.data.options.find(o => o.name === 'channel')?.value) || interaction.channel_id;

  const embed = {
    title: '🔊 VOID ROLEPLAY — PATROL & SQUAD VOICE CONTROLS',
    description: [
      'Welcome to the **Master Squad & Patrol Voice Manager**.',
      '',
      'When you join the **Join to Create** voice room, a dedicated squad frequency is automatically carved for you.',
      'Use the tactical controls below to manage your squad room:',
      '',
      '• 🔒 **Lock Room** — Restrict squad access to current members only',
      '• 🔓 **Unlock Room** — Open squad room to all citizens',
      '• 🔇 **Mute Member** — Server-mute an unwanted participant',
      '• 🔊 **Unmute Member** — Remove mute from a participant',
      '• 🚫 **Disconnect / Kick** — Eject a member from your room',
      '• 👥 **Set User Limit** — Set max player capacity (2-99 slots)',
      '• ✏️ **Rename Patrol** — Change room name (e.g. LSPD Patrol 1, Vagos)',
      '• ❌ **Delete Patrol** — Instantly decommission the squad channel'
    ].join('\n'),
    color: VOID_THEME_COLOR,
    footer: {
      text: 'VOID Roleplay Voice Network • 24/7 Auto-Clean Gateway'
    },
    timestamp: new Date().toISOString()
  };

  const row1 = {
    type: 1,
    components: [
      { type: 2, style: 2, label: 'Lock', custom_id: 'vc_panel_lock', emoji: { name: '🔒' } },
      { type: 2, style: 2, label: 'Unlock', custom_id: 'vc_panel_unlock', emoji: { name: '🔓' } },
      { type: 2, style: 2, label: 'Mute', custom_id: 'vc_panel_mute', emoji: { name: '🔇' } },
      { type: 2, style: 2, label: 'Unmute', custom_id: 'vc_panel_unmute', emoji: { name: '🔊' } }
    ]
  };

  const row2 = {
    type: 1,
    components: [
      { type: 2, style: 2, label: 'Kick', custom_id: 'vc_panel_kick', emoji: { name: '🚫' } },
      { type: 2, style: 2, label: 'Set Limit', custom_id: 'vc_panel_limit', emoji: { name: '👥' } },
      { type: 2, style: 2, label: 'Rename', custom_id: 'vc_panel_rename', emoji: { name: '✏️' } },
      { type: 2, style: 4, label: 'Delete', custom_id: 'vc_panel_delete', emoji: { name: '❌' } }
    ]
  };

  try {
    await discordFetch('/channels/' + targetChannelId + '/messages', {
      method: 'POST',
      body: JSON.stringify({
        embeds: [embed],
        components: [row1, row2]
      })
    });

    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: '✅ **VOID Roleplay Voice Control Panel successfully deployed to <#' + targetChannelId + '>!**',
        flags: 64
      }
    };
  } catch (err) {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: '❌ **Failed to deploy Voice Panel:** ' + err.message, flags: 64 }
    };
  }
}

// ----------------------------------------------------
// 4. /vc COMMAND HANDLER
// ----------------------------------------------------
async function handleVCCommand(interaction) {
  const sub = interaction.data.options && interaction.data.options[0];
  if (!sub) {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: '⚠️ Missing /vc subcommand.', flags: 64 }
    };
  }

  const subName = sub.name;
  const subOptions = sub.options || [];
  const guildId = interaction.guild_id;
  const member = interaction.member;
  const userId = member?.user?.id;

  // Check user voice state
  let voiceChannelId = null;
  try {
    const guild = await discordFetch('/guilds/' + guildId + '?with_counts=false');
    const voiceStates = guild.voice_states || [];
    const vs = voiceStates.find(v => v.user_id === userId);
    if (vs) voiceChannelId = vs.channel_id;
  } catch (_) {}

  if (subName === 'create') {
    const nameArg = subOptions.find(o => o.name === 'name')?.value || (member?.user?.global_name || member?.user?.username) + "'s Patrol";
    const limitArg = subOptions.find(o => o.name === 'limit')?.value || 0;

    try {
      const newChannel = await discordFetch('/guilds/' + guildId + '/channels', {
        method: 'POST',
        body: JSON.stringify({
          name: '🔊 ' + nameArg,
          type: 2, // GUILD_VOICE
          user_limit: Math.min(Math.max(limitArg, 0), 99)
        })
      });

      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: '✅ **Squad Patrol Created:** <#' + newChannel.id + '>\nJoin the channel to start your patrol!',
          flags: 64
        }
      };
    } catch (err) {
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '❌ Failed to create voice channel: ' + err.message, flags: 64 }
      };
    }
  }

  if (!voiceChannelId) {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: '⚠️ You must be connected to a voice channel to use `/vc ' + subName + '`.', flags: 64 }
    };
  }

  if (subName === 'lock') {
    try {
      await discordFetch('/channels/' + voiceChannelId + '/permissions/' + guildId, {
        method: 'PUT',
        body: JSON.stringify({
          allow: '0',
          deny: PERM_FLAGS.connect.toString(),
          type: 0 // Role (@everyone)
        })
      });
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '🔒 **Squad Room Locked.** Only current occupants can stay.', flags: 64 }
      };
    } catch (err) {
      return { type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: '❌ Failed to lock: ' + err.message, flags: 64 } };
    }
  }

  if (subName === 'unlock') {
    try {
      await discordFetch('/channels/' + voiceChannelId + '/permissions/' + guildId, {
        method: 'DELETE'
      });
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '🔓 **Squad Room Unlocked.** All citizens may join.', flags: 64 }
      };
    } catch (err) {
      return { type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: '❌ Failed to unlock: ' + err.message, flags: 64 } };
    }
  }

  if (subName === 'mute' || subName === 'unmute') {
    const targetUserId = subOptions.find(o => o.name === 'user')?.value;
    const shouldMute = subName === 'mute';
    try {
      await discordFetch('/guilds/' + guildId + '/members/' + targetUserId, {
        method: 'PATCH',
        body: JSON.stringify({ mute: shouldMute })
      });
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: (shouldMute ? '🔇 Muted' : '🔊 Unmuted') + ' <@' + targetUserId + '> in patrol voice.', flags: 64 }
      };
    } catch (err) {
      return { type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: '❌ Failed to ' + subName + ': ' + err.message, flags: 64 } };
    }
  }

  if (subName === 'kick') {
    const targetUserId = subOptions.find(o => o.name === 'user')?.value;
    try {
      await discordFetch('/guilds/' + guildId + '/members/' + targetUserId, {
        method: 'PATCH',
        body: JSON.stringify({ channel_id: null })
      });
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '🚫 Disconnected <@' + targetUserId + '> from the patrol room.', flags: 64 }
      };
    } catch (err) {
      return { type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: '❌ Failed to kick user: ' + err.message, flags: 64 } };
    }
  }

  if (subName === 'limit') {
    const amount = subOptions.find(o => o.name === 'amount')?.value || 0;
    try {
      await discordFetch('/channels/' + voiceChannelId, {
        method: 'PATCH',
        body: JSON.stringify({ user_limit: Math.min(Math.max(amount, 0), 99) })
      });
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '👥 Squad player limit set to `' + amount + '` slots.', flags: 64 }
      };
    } catch (err) {
      return { type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: '❌ Failed to set limit: ' + err.message, flags: 64 } };
    }
  }

  if (subName === 'rename') {
    const newName = subOptions.find(o => o.name === 'name')?.value;
    try {
      await discordFetch('/channels/' + voiceChannelId, {
        method: 'PATCH',
        body: JSON.stringify({ name: '🔊 ' + newName })
      });
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '✏️ Squad room renamed to `🔊 ' + newName + '`.', flags: 64 }
      };
    } catch (err) {
      return { type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: '❌ Failed to rename: ' + err.message, flags: 64 } };
    }
  }

  if (subName === 'delete') {
    try {
      await discordFetch('/channels/' + voiceChannelId, { method: 'DELETE' });
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '❌ **Squad Room Deleted.**', flags: 64 }
      };
    } catch (err) {
      return { type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: '❌ Failed to delete room: ' + err.message, flags: 64 } };
    }
  }

  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content: 'Unknown /vc action.', flags: 64 }
  };
}

// ----------------------------------------------------
// 5. CITY STATUS COMMAND (/city-status)
// ----------------------------------------------------
async function handleCityStatusCommand(interaction) {
  if (!isStaff(interaction.member)) {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: '❌ **Access Denied:** Only High Command and Staff can broadcast City Status.', flags: 64 }
    };
  }

  const options = interaction.data.options || [];
  const statusType = options.find(o => o.name === 'status')?.value || 'online';
  const connectIp = options.find(o => o.name === 'connect_ip')?.value || 'cfx.re/join/voidroleplay';
  const playerCount = options.find(o => o.name === 'player_count')?.value || 'Active Citizens';

  const statusConfigs = {
    online: {
      title: '🟢 VOID ROLEPLAY — CITY SERVER IS ONLINE & LIVE',
      description: [
        'The VOID Roleplay FiveM server is **online and fully accessible**.',
        '',
        '**Direct Connect Link:**',
        '`' + connectIp + '`',
        '',
        '**Live Population:** `' + playerCount + '`',
        '**Framework:** QBCore / Custom VOID Engine',
        '',
        'Press `F8` in FiveM and type: `connect ' + connectIp + '`'
      ].join('\n'),
      color: 0x57F287
    },
    restart: {
      title: '🟡 VOID ROLEPLAY — SCHEDULED SERVER RESTART (TSUNAMI)',
      description: [
        '⚠️ **Attention Citizens:** A scheduled city tsunami / restart is commencing.',
        '',
        '• **Time Remaining:** 5 Minutes',
        '• **Action Required:** Wrap up your current active RP scenarios, park your vehicles in garages, and log off safely to prevent data loss.',
        '',
        'The server will reboot and reopen immediately following the storm.'
      ].join('\n'),
      color: 0xFEE75C
    },
    offline: {
      title: '🔴 VOID ROLEPLAY — SERVER OFFLINE / SCHEDULED MAINTENANCE',
      description: [
        'The VOID Roleplay server is currently **offline for scheduled maintenance & development updates**.',
        '',
        'Our development team is currently pushing new city assets, scripts, and optimizations.',
        'Check back in this channel for the live online broadcast once maintenance concludes.'
      ].join('\n'),
      color: 0xED4245
    },
    queue: {
      title: '🟠 VOID ROLEPLAY — HIGH QUEUE ALERT / PRIORITY ACTIVE',
      description: [
        'The city is currently operating at **peak capacity** with a high queue.',
        '',
        '• **Current Capacity:** `' + playerCount + '`',
        '• **Direct Connect:** `' + connectIp + '`',
        '• **Priority Access:** Citizens with VIP Priority queue will bypass standard citizen waiting lines.',
        '',
        'Please be patient while the queue processes.'
      ].join('\n'),
      color: 0xE67E22
    }
  };

  const selected = statusConfigs[statusType] || statusConfigs.online;

  const embed = {
    title: selected.title,
    description: selected.description,
    color: selected.color,
    footer: {
      text: 'VOID Roleplay FiveM Network • Live Status Broadcast'
    },
    timestamp: new Date().toISOString()
  };

  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      embeds: [embed]
    }
  };
}

// ----------------------------------------------------
// 6. AUTOMOD SECURITY SHIELDS
// ----------------------------------------------------
async function handleAutoModCommand(interaction) {
  if (!isStaff(interaction.member)) {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: '❌ **Access Denied:** Only Staff can configure AutoMod shields.', flags: 64 }
    };
  }

  const sub = interaction.data.options && interaction.data.options[0];
  const subName = sub?.name;
  const guildId = interaction.guild_id;

  if (subName === 'setup') {
    const subOpts = sub.options || [];
    const timeoutMin = subOpts.find(o => o.name === 'timeout_minutes')?.value || 60;
    const timeoutSec = timeoutMin * 60;

    const rulesToDeploy = [
      {
        name: '🛡️ VOID Anti-Invite Shield',
        event_type: 1, // MESSAGE_SEND
        trigger_type: 1, // KEYWORD
        trigger_metadata: {
          keyword_filter: ['*discord.gg/*', '*discord.com/invite/*', '*discordapp.com/invite/*']
        },
        actions: [
          { type: 1 }, // BLOCK_MESSAGE
          { type: 3, metadata: { duration_seconds: timeoutSec } } // TIMEOUT
        ],
        enabled: true
      },
      {
        name: '🛡️ VOID Anti-Phishing & Scam Shield',
        event_type: 1,
        trigger_type: 1,
        trigger_metadata: {
          keyword_filter: ['*free nitro*', '*steamcommunity-nitro*', '*discorcl.*', '*discord-nitro*']
        },
        actions: [
          { type: 1 },
          { type: 3, metadata: { duration_seconds: timeoutSec } }
        ],
        enabled: true
      },
      {
        name: '🛡️ VOID Anti-Mass Mention Shield',
        event_type: 1,
        trigger_type: 5, // MENTION_SPAM
        trigger_metadata: {
          mention_total_limit: 5
        },
        actions: [
          { type: 1 },
          { type: 3, metadata: { duration_seconds: timeoutSec } }
        ],
        enabled: true
      },
      {
        name: '🛡️ VOID Anti-Spam Shield',
        event_type: 1,
        trigger_type: 3, // SPAM
        actions: [{ type: 1 }],
        enabled: true
      }
    ];

    const results = [];
    for (const r of rulesToDeploy) {
      try {
        await discordFetch('/guilds/' + guildId + '/auto-moderation/rules', {
          method: 'POST',
          body: JSON.stringify(r)
        });
        results.push('✅ ' + r.name);
      } catch (err) {
        results.push('⚠️ ' + r.name + ' (' + err.message + ')');
      }
    }

    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [{
          title: '🛡️ VOID Auto-Mod 4-Layer Security Shield Deployed',
          description: results.join('\n') + '\n\n*All shields are actively monitoring messages 24/7.*',
          color: VOID_THEME_COLOR
        }],
        flags: 64
      }
    };
  }

  if (subName === 'status') {
    try {
      const activeRules = await discordFetch('/guilds/' + guildId + '/auto-moderation/rules');
      const lines = activeRules.map(r => '• **' + r.name + '** — ' + (r.enabled ? '🟢 Active' : '🔴 Disabled'));
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [{
            title: '🛡️ VOID Roleplay Active Security Shields',
            description: lines.length ? lines.join('\n') : 'No AutoMod shields currently configured. Run `/automod setup` to deploy.',
            color: VOID_THEME_COLOR
          }],
          flags: 64
        }
      };
    } catch (err) {
      return { type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: '❌ Failed to fetch AutoMod status: ' + err.message, flags: 64 } };
    }
  }

  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content: 'AutoMod shield command completed.', flags: 64 }
  };
}

// ----------------------------------------------------
// 7. CHANNEL MANAGEMENT (/channel)
// ----------------------------------------------------
async function handleChannelCommand(interaction) {
  if (!isStaff(interaction.member)) {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: '❌ **Access Denied:** Only Staff can manage channels.', flags: 64 }
    };
  }

  const sub = interaction.data.options && interaction.data.options[0];
  const subName = sub?.name;
  const subOpts = sub?.options || [];
  const guildId = interaction.guild_id;
  const channelId = interaction.channel_id;

  if (subName === 'create') {
    const chName = subOpts.find(o => o.name === 'name')?.value;
    const chType = subOpts.find(o => o.name === 'type')?.value === 'voice' ? 2 : 0;
    try {
      const created = await discordFetch('/guilds/' + guildId + '/channels', {
        method: 'POST',
        body: JSON.stringify({ name: chName, type: chType })
      });
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '✅ Channel created: <#' + created.id + '>', flags: 64 }
      };
    } catch (err) {
      return { type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: '❌ Failed: ' + err.message, flags: 64 } };
    }
  }

  if (subName === 'delete') {
    try {
      await discordFetch('/channels/' + channelId, { method: 'DELETE' });
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '🗑️ Channel deleted.', flags: 64 }
      };
    } catch (err) {
      return { type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: '❌ Failed: ' + err.message, flags: 64 } };
    }
  }

  if (subName === 'purge') {
    const amount = subOpts.find(o => o.name === 'amount')?.value || 10;
    try {
      const msgs = await discordFetch('/channels/' + channelId + '/messages?limit=' + amount);
      const msgIds = msgs.map(m => m.id);
      if (msgIds.length > 0) {
        await discordFetch('/channels/' + channelId + '/messages/bulk-delete', {
          method: 'POST',
          body: JSON.stringify({ messages: msgIds })
        });
      }
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '🧹 Successfully purged `' + msgIds.length + '` messages.', flags: 64 }
      };
    } catch (err) {
      return { type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: '❌ Failed to purge: ' + err.message, flags: 64 } };
    }
  }

  if (subName === 'lock') {
    try {
      await discordFetch('/channels/' + channelId + '/permissions/' + guildId, {
        method: 'PUT',
        body: JSON.stringify({
          allow: '0',
          deny: PERM_FLAGS.send_messages.toString(),
          type: 0
        })
      });
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '🔒 <#' + channelId + '> locked for citizens.', flags: 64 }
      };
    } catch (err) {
      return { type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: '❌ Failed to lock: ' + err.message, flags: 64 } };
    }
  }

  if (subName === 'unlock') {
    try {
      await discordFetch('/channels/' + channelId + '/permissions/' + guildId, { method: 'DELETE' });
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '🔓 <#' + channelId + '> unlocked for citizens.', flags: 64 }
      };
    } catch (err) {
      return { type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: '❌ Failed to unlock: ' + err.message, flags: 64 } };
    }
  }

  return { type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: 'Channel action processed.', flags: 64 } };
}

// ----------------------------------------------------
// 8. ROLE MANAGEMENT (/role)
// ----------------------------------------------------
async function handleRoleCommand(interaction) {
  if (!isStaff(interaction.member)) {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: '❌ **Access Denied:** Only Staff can manage roles.', flags: 64 }
    };
  }

  const sub = interaction.data.options && interaction.data.options[0];
  const subName = sub?.name;
  const subOpts = sub?.options || [];
  const guildId = interaction.guild_id;

  if (subName === 'create') {
    const roleName = subOpts.find(o => o.name === 'name')?.value;
    const colorHex = subOpts.find(o => o.name === 'color')?.value;
    const permPreset = subOpts.find(o => o.name === 'permissions')?.value;

    const color = parseColorHex(colorHex);
    const perms = resolvePermissions(permPreset);

    try {
      const created = await discordFetch('/guilds/' + guildId + '/roles', {
        method: 'POST',
        body: JSON.stringify({
          name: roleName,
          color: color,
          permissions: perms.bits
        })
      });

      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [{
            title: '🎭 Role Created Successfully',
            description: [
              '• **Role:** <@&' + created.id + '>',
              '• **Color:** `#' + color.toString(16).toUpperCase() + '`',
              '• **Permissions:** ' + perms.label
            ].join('\n'),
            color: color
          }]
        }
      };
    } catch (err) {
      return { type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: '❌ Failed to create role: ' + err.message, flags: 64 } };
    }
  }

  if (subName === 'give') {
    const targetUserId = subOpts.find(o => o.name === 'user')?.value;
    const roleId = subOpts.find(o => o.name === 'role')?.value;
    try {
      await discordFetch('/guilds/' + guildId + '/members/' + targetUserId + '/roles/' + roleId, { method: 'PUT' });
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '✅ Assigned <@&' + roleId + '> to <@' + targetUserId + '>.', flags: 64 }
      };
    } catch (err) {
      return { type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: '❌ Failed: ' + err.message, flags: 64 } };
    }
  }

  if (subName === 'remove') {
    const targetUserId = subOpts.find(o => o.name === 'user')?.value;
    const roleId = subOpts.find(o => o.name === 'role')?.value;
    try {
      await discordFetch('/guilds/' + guildId + '/members/' + targetUserId + '/roles/' + roleId, { method: 'DELETE' });
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '✅ Removed <@&' + roleId + '> from <@' + targetUserId + '>.', flags: 64 }
      };
    } catch (err) {
      return { type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: '❌ Failed: ' + err.message, flags: 64 } };
    }
  }

  if (subName === 'delete') {
    const roleId = subOpts.find(o => o.name === 'role')?.value;
    try {
      await discordFetch('/guilds/' + guildId + '/roles/' + roleId, { method: 'DELETE' });
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '🗑️ Role deleted.', flags: 64 }
      };
    } catch (err) {
      return { type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: '❌ Failed: ' + err.message, flags: 64 } };
    }
  }

  if (subName === 'list') {
    try {
      const roles = await discordFetch('/guilds/' + guildId + '/roles');
      const topRoles = roles.slice(0, 25).map(r => '• <@&' + r.id + '> (`' + r.id + '`)');
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [{
            title: '📋 VOID Roleplay Server Roles',
            description: topRoles.join('\n'),
            color: VOID_THEME_COLOR
          }],
          flags: 64
        }
      };
    } catch (err) {
      return { type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: '❌ Failed to list roles: ' + err.message, flags: 64 } };
    }
  }

  return { type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: 'Role command executed.', flags: 64 } };
}

// ----------------------------------------------------
// 9. AUTOROLE (/autorole)
// ----------------------------------------------------
let autoRoleIdConfig = null;

async function handleAutoRoleCommand(interaction) {
  if (!isStaff(interaction.member)) {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: '❌ **Access Denied:** Only Staff can configure Auto-Role.', flags: 64 }
    };
  }

  const sub = interaction.data.options && interaction.data.options[0];
  const subName = sub?.name;
  const subOpts = sub?.options || [];

  if (subName === 'set') {
    const roleId = subOpts.find(o => o.name === 'role')?.value;
    autoRoleIdConfig = roleId;
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: '✅ Auto-Role set to <@&' + roleId + '>. New citizens will automatically receive this role.', flags: 64 }
    };
  }

  if (subName === 'check') {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: autoRoleIdConfig ? ('ℹ️ Active Auto-Role: <@&' + autoRoleIdConfig + '>') : 'ℹ️ No Auto-Role currently configured.',
        flags: 64
      }
    };
  }

  if (subName === 'remove') {
    autoRoleIdConfig = null;
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: '✅ Auto-Role disabled.', flags: 64 }
    };
  }

  return { type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: 'Auto-Role configured.', flags: 64 } };
}

// ----------------------------------------------------
// 10. BLACKLIST (/blacklist)
// ----------------------------------------------------
async function handleBlacklistCommand(interaction) {
  if (!isStaff(interaction.member)) {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: '❌ **Access Denied:** Only Staff can manage the blacklist.', flags: 64 }
    };
  }

  const sub = interaction.data.options && interaction.data.options[0];
  const subName = sub?.name;
  const subOpts = sub?.options || [];
  const guildId = interaction.guild_id;

  if (!blacklistCache) blacklistCache = new Set();

  if (subName === 'add') {
    const targetUserId = subOpts.find(o => o.name === 'user')?.value;
    const reason = subOpts.find(o => o.name === 'reason')?.value || 'Trolling / Rulebreak';

    blacklistCache.add(targetUserId);
    blacklistCacheTime = Date.now();

    // Also assign role if role exists
    const roleId = await getBlacklistRoleId(guildId);
    if (roleId) {
      try {
        await discordFetch('/guilds/' + guildId + '/members/' + targetUserId + '/roles/' + roleId, { method: 'PUT' });
      } catch (_) {}
    }

    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: '🚫 **Blacklisted:** <@' + targetUserId + '> has been banned from opening tickets.\n**Reason:** ' + reason,
        flags: 64
      }
    };
  }

  if (subName === 'remove') {
    const targetUserId = subOpts.find(o => o.name === 'user')?.value;
    blacklistCache.delete(targetUserId);

    const roleId = await getBlacklistRoleId(guildId);
    if (roleId) {
      try {
        await discordFetch('/guilds/' + guildId + '/members/' + targetUserId + '/roles/' + roleId, { method: 'DELETE' });
      } catch (_) {}
    }

    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: '✅ Removed <@' + targetUserId + '> from the blacklist.', flags: 64 }
    };
  }

  if (subName === 'check') {
    const targetUserId = subOpts.find(o => o.name === 'user')?.value;
    const blacklisted = blacklistCache.has(targetUserId);
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: blacklisted ? ('🚫 <@' + targetUserId + '> IS blacklisted.') : ('✅ <@' + targetUserId + '> is NOT blacklisted.'),
        flags: 64
      }
    };
  }

  if (subName === 'list') {
    const list = Array.from(blacklistCache);
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [{
          title: '🚫 VOID Roleplay Blacklist',
          description: list.length ? list.map(id => '• <@' + id + '> (`' + id + '`)').join('\n') : 'No users currently blacklisted in active memory.',
          color: 0xED4245
        }],
        flags: 64
      }
    };
  }

  return { type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: 'Blacklist updated.', flags: 64 } };
}

// ----------------------------------------------------
// MESSAGE COMPONENTS (BUTTONS & SELECT MENUS)
// ----------------------------------------------------
async function handleComponent(interaction) {
  const customId = interaction.data.custom_id;
  const member = interaction.member;
  const userId = member?.user?.id;
  const guildId = interaction.guild_id;

  // 1. Citizen Verification Button
  if (customId.startsWith('verify_citizen_btn')) {
    const parts = customId.split(':');
    let targetRoleId = parts[1];

    if (!targetRoleId) {
      try {
        const roles = await discordFetch('/guilds/' + guildId + '/roles');
        const citizenRole = roles.find(r => r.name.toLowerCase() === 'citizen' || r.name.toLowerCase() === 'verified');
        if (citizenRole) targetRoleId = citizenRole.id;
      } catch (_) {}
    }

    if (!targetRoleId) {
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '⚠️ Citizen role not found. Please notify Server Staff to configure `/setup-verify`.', flags: 64 }
      };
    }

    try {
      await discordFetch('/guilds/' + guildId + '/members/' + userId + '/roles/' + targetRoleId, {
        method: 'PUT'
      });
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: '✅ **Verification Confirmed!** You have been granted the <@&' + targetRoleId + '> role. Welcome to VOID Roleplay!',
          flags: 64
        }
      };
    } catch (err) {
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '❌ Verification failed: ' + err.message, flags: 64 }
      };
    }
  }

  // 2. Ticket Department Select Menu -> Show Modal
  if (customId === 'ticket_category_select') {
    const selected = interaction.data.values && interaction.data.values[0];
    return presentTicketModal(selected);
  }

  // 3. Ticket Channel Action Buttons
  if (customId.startsWith('ticket_')) {
    return handleTicketStaffAction(interaction, customId);
  }

  // 4. Voice Panel Buttons
  if (customId.startsWith('vc_panel_')) {
    return handleVoicePanelAction(interaction, customId);
  }

  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content: 'Unknown button action.', flags: 64 }
  };
}

// ----------------------------------------------------
// TICKET MODAL BUILDERS
// ----------------------------------------------------
function presentTicketModal(category) {
  if (category === 'ticket_cat_whitelist') {
    return {
      type: InteractionResponseType.MODAL,
      data: {
        custom_id: 'modal_submit_whitelist',
        title: 'VOID Whitelist Application',
        components: [
          {
            type: 1,
            components: [{
              type: 4,
              custom_id: 'char_name_age',
              label: 'Character Full Name & Age',
              style: 1,
              placeholder: 'e.g. Marcus Vance, 28',
              required: true
            }]
          },
          {
            type: 1,
            components: [{
              type: 4,
              custom_id: 'steam_hex',
              label: 'Steam Hex ID / CFX Account',
              style: 1,
              placeholder: 'steam:1100001xxxxxxxx',
              required: true
            }]
          },
          {
            type: 1,
            components: [{
              type: 4,
              custom_id: 'char_backstory',
              label: 'Character Backstory & Motivation',
              style: 2,
              placeholder: 'Provide an overview of your character history, origin, and goals in the city...',
              required: true
            }]
          },
          {
            type: 1,
            components: [{
              type: 4,
              custom_id: 'rp_experience',
              label: 'Prior FiveM RP Experience',
              style: 2,
              placeholder: 'What other servers have you played on? How many hours of RP experience?',
              required: true
            }]
          }
        ]
      }
    };
  }

  if (category === 'ticket_cat_report') {
    return {
      type: InteractionResponseType.MODAL,
      data: {
        custom_id: 'modal_submit_report',
        title: 'Player Incident / Rulebreak Report',
        components: [
          {
            type: 1,
            components: [{
              type: 4,
              custom_id: 'reporter_info',
              label: 'Your Character Name & In-Game ID',
              style: 1,
              placeholder: 'e.g. Dominic Toretto | ID #42',
              required: true
            }]
          },
          {
            type: 1,
            components: [{
              type: 4,
              custom_id: 'reported_info',
              label: 'Accused Player Name / ID / Steam Hex',
              style: 1,
              placeholder: 'e.g. ID #88 or Unknown masked player in black Sultan',
              required: true
            }]
          },
          {
            type: 1,
            components: [{
              type: 4,
              custom_id: 'rule_broken',
              label: 'Rule Broken (RDM, VDM, FearRP, CombatLog)',
              style: 1,
              placeholder: 'e.g. RDM at Legion Square & Combat Logging during scene',
              required: true
            }]
          },
          {
            type: 1,
            components: [{
              type: 4,
              custom_id: 'incident_summary',
              label: 'Incident Summary & Timeline',
              style: 2,
              placeholder: 'Explain what transpired leading up to the rulebreak...',
              required: true
            }]
          },
          {
            type: 1,
            components: [{
              type: 4,
              custom_id: 'clip_evidence',
              label: 'Video Clip Link (Medal, YouTube, Streamable)',
              style: 1,
              placeholder: 'https://medal.tv/clip/... or YouTube link (Mandatory for reports)',
              required: true
            }]
          }
        ]
      }
    };
  }

  if (category === 'ticket_cat_appeal') {
    return {
      type: InteractionResponseType.MODAL,
      data: {
        custom_id: 'modal_submit_appeal',
        title: 'VOID Roleplay Ban Appeal',
        components: [
          {
            type: 1,
            components: [{
              type: 4,
              custom_id: 'ban_identity',
              label: 'Banned Character Name / Steam Hex',
              style: 1,
              placeholder: 'steam:1100001xxxxxxxx / In-Game Name',
              required: true
            }]
          },
          {
            type: 1,
            components: [{
              type: 4,
              custom_id: 'ban_reason',
              label: 'Ban Reason & Banning Staff Member',
              style: 1,
              placeholder: 'e.g. Banned for VDM by Staff member',
              required: true
            }]
          },
          {
            type: 1,
            components: [{
              type: 4,
              custom_id: 'appeal_justification',
              label: 'Why should your ban be lifted?',
              style: 2,
              placeholder: 'Explain your side, what you have learned, and why you should be unbanned...',
              required: true
            }]
          }
        ]
      }
    };
  }

  if (category === 'ticket_cat_gang') {
    return {
      type: InteractionResponseType.MODAL,
      data: {
        custom_id: 'modal_submit_gang',
        title: 'Gang & Faction Registration',
        components: [
          {
            type: 1,
            components: [{
              type: 4,
              custom_id: 'gang_name',
              label: 'Gang / Syndicate Name',
              style: 1,
              placeholder: 'e.g. Marabunta Grande / 67th Street Mafia',
              required: true
            }]
          },
          {
            type: 1,
            components: [{
              type: 4,
              custom_id: 'leader_info',
              label: 'Leader Character Name & Discord Tag',
              style: 1,
              placeholder: 'e.g. Carlos Mendez (@carlos)',
              required: true
            }]
          },
          {
            type: 1,
            components: [{
              type: 4,
              custom_id: 'turf_location',
              label: 'Claimed Turf / Neighborhood Location',
              style: 1,
              placeholder: 'e.g. El Burro Heights / Brouge Avenue',
              required: true
            }]
          },
          {
            type: 1,
            components: [{
              type: 4,
              custom_id: 'gang_lore_roster',
              label: 'Gang Lore & Active Roster (Names & IDs)',
              style: 2,
              placeholder: 'Brief syndicate history and list of founding members...',
              required: true
            }]
          }
        ]
      }
    };
  }

  if (category === 'ticket_cat_business') {
    return {
      type: InteractionResponseType.MODAL,
      data: {
        custom_id: 'modal_submit_business',
        title: 'Business & MLO Proposal',
        components: [
          {
            type: 1,
            components: [{
              type: 4,
              custom_id: 'business_name',
              label: 'Business / Enterprise Name',
              style: 1,
              placeholder: 'e.g. Hayes Customs / Bean Machine',
              required: true
            }]
          },
          {
            type: 1,
            components: [{
              type: 4,
              custom_id: 'owner_char',
              label: 'Owner Character Name & In-Game ID',
              style: 1,
              placeholder: 'e.g. Anthony Soprano | ID #14',
              required: true
            }]
          },
          {
            type: 1,
            components: [{
              type: 4,
              custom_id: 'biz_location',
              label: 'Requested Location / Custom MLO details',
              style: 1,
              placeholder: 'Coordinates, address, or custom MLO pack link...',
              required: true
            }]
          },
          {
            type: 1,
            components: [{
              type: 4,
              custom_id: 'biz_concept',
              label: 'Business Plan & Citizen RP Impact',
              style: 2,
              placeholder: 'How will this business create roleplay opportunities for citizens?',
              required: true
            }]
          }
        ]
      }
    };
  }

  if (category === 'ticket_cat_bug') {
    return {
      type: InteractionResponseType.MODAL,
      data: {
        custom_id: 'modal_submit_bug',
        title: 'Bug & Glitch Report',
        components: [
          {
            type: 1,
            components: [{
              type: 4,
              custom_id: 'bug_summary',
              label: 'Bug Summary / Script Area',
              style: 1,
              placeholder: 'e.g. Inventory duping, Garage vehicle despawn',
              required: true
            }]
          },
          {
            type: 1,
            components: [{
              type: 4,
              custom_id: 'reproduce_steps',
              label: 'Steps to Reproduce',
              style: 2,
              placeholder: '1. Go to garage\n2. Pull vehicle...\n3. Observe error...',
              required: true
            }]
          },
          {
            type: 1,
            components: [{
              type: 4,
              custom_id: 'bug_evidence',
              label: 'Screenshot / F8 Console Log / Video Link',
              style: 1,
              placeholder: 'Imgur / Medal / YouTube link',
              required: false
            }]
          }
        ]
      }
    };
  }

  // Default: General City Support
  return {
    type: InteractionResponseType.MODAL,
    data: {
      custom_id: 'modal_submit_support',
      title: 'VOID General City Support',
      components: [
        {
          type: 1,
          components: [{
            type: 4,
            custom_id: 'support_char',
            label: 'Character Name & In-Game ID',
            style: 1,
            placeholder: 'e.g. Tyler Durden | ID #77',
            required: true
          }]
        },
        {
          type: 1,
          components: [{
            type: 4,
            custom_id: 'support_details',
            label: 'Explain your issue or question',
            style: 2,
            placeholder: 'Detail your issue so staff can assist you immediately...',
            required: true
          }]
        }
      ]
    }
  };
}

// ----------------------------------------------------
// MODAL SUBMISSION HANDLER -> CREATE TICKET CHANNEL
// ----------------------------------------------------
async function handleModalSubmit(interaction) {
  const customId = interaction.data.custom_id;
  const member = interaction.member;
  const userId = member?.user?.id;
  const userTag = member?.user?.global_name || member?.user?.username;
  const guildId = interaction.guild_id;

  // Extract form fields
  const fields = {};
  for (const row of interaction.data.components || []) {
    for (const comp of row.components || []) {
      fields[comp.custom_id] = comp.value;
    }
  }

  // Map modal type to ticket metadata
  const metaMap = {
    modal_submit_whitelist: { prefix: 'whitelist-', title: '📋 Whitelist Application', rolePing: 'High Command / Whitelist Staff' },
    modal_submit_report: { prefix: 'report-', title: '🚨 Player Rulebreak Report', rolePing: 'Staff Team' },
    modal_submit_appeal: { prefix: 'appeal-', title: '⚖️ Ban Appeal', rolePing: 'High Command / Senior Staff' },
    modal_submit_gang: { prefix: 'gang-', title: '🏴 Gang Registration', rolePing: 'Gang High Command' },
    modal_submit_business: { prefix: 'biz-', title: '🏢 Business Proposal', rolePing: 'City Council / Economy High Command' },
    modal_submit_bug: { prefix: 'bug-', title: '🐛 Bug & Glitch Report', rolePing: 'Development Team' },
    modal_submit_support: { prefix: 'support-', title: '❓ General City Support', rolePing: 'Support Staff' }
  };

  const meta = metaMap[customId] || { prefix: 'ticket-', title: '🎫 City Ticket', rolePing: 'Staff' };
  const channelName = meta.prefix + (userTag.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15) || 'citizen');

  try {
    // Determine category ID if configured or search guild
    let categoryId = TICKETS_CATEGORY_ID;
    if (!categoryId) {
      try {
        const guildChannels = await discordFetch('/guilds/' + guildId + '/channels');
        const foundCat = guildChannels.find(c => c.type === 4 && c.name.toLowerCase().includes('ticket'));
        if (foundCat) categoryId = foundCat.id;
      } catch (_) {}
    }

    // Channel permission overwrites:
    // @everyone deny view channel
    // Creator allow view, send, attach, embed, read history
    const permissionOverwrites = [
      {
        id: guildId,
        type: 0,
        allow: '0',
        deny: PERM_FLAGS.view_channel.toString()
      },
      {
        id: userId,
        type: 1,
        allow: (PERM_FLAGS.view_channel | PERM_FLAGS.send_messages | PERM_FLAGS.attach_files | PERM_FLAGS.embed_links | PERM_FLAGS.read_message_history).toString(),
        deny: '0'
      }
    ];

    const staffRoleId = process.env.STAFF_ROLE_ID;
    if (staffRoleId) {
      permissionOverwrites.push({
        id: staffRoleId,
        type: 0,
        allow: (PERM_FLAGS.view_channel | PERM_FLAGS.send_messages | PERM_FLAGS.attach_files | PERM_FLAGS.embed_links | PERM_FLAGS.read_message_history | PERM_FLAGS.manage_messages).toString(),
        deny: '0'
      });
    }

    const newTicketChannel = await discordFetch('/guilds/' + guildId + '/channels', {
      method: 'POST',
      body: JSON.stringify({
        name: channelName,
        type: 0, // GUILD_TEXT
        parent_id: categoryId || undefined,
        permission_overwrites: permissionOverwrites
      })
    });

    // Build fields summary for embed
    const embedFields = Object.entries(fields).map(([k, v]) => {
      let label = k.replace(/_/g, ' ').toUpperCase();
      return {
        name: '📌 ' + label,
        value: v.slice(0, 1024),
        inline: false
      };
    });

    embedFields.unshift(
      { name: '👤 Citizen / Submitter', value: '<@' + userId + '> (`' + userId + '`)', inline: true },
      { name: '⏱️ Created At', value: '<t:' + Math.floor(Date.now() / 1000) + ':F>', inline: true },
      { name: '🔄 Case Status', value: '🟡 **INITIALIZED (AWAITING STAFF)**', inline: true }
    );

    const ticketEmbed = {
      title: '🌌 VOID ROLEPLAY — ' + meta.title.toUpperCase(),
      description: 'A new official inquiry has been filed. Please remain patient while Staff reviews the submission details below.',
      fields: embedFields,
      color: VOID_THEME_COLOR,
      footer: { text: 'Ticket ID: ' + newTicketChannel.id + ' • High Command' },
      timestamp: new Date().toISOString()
    };

    // Staff action buttons row 1
    const staffRow1 = {
      type: 1,
      components: [
        { type: 2, style: 1, label: 'Claim Ticket', custom_id: 'ticket_claim', emoji: { name: '🛡️' } },
        { type: 2, style: 2, label: 'In Investigation', custom_id: 'ticket_investigate', emoji: { name: '🔍' } },
        { type: 2, style: 3, label: 'Resolve Case', custom_id: 'ticket_resolve', emoji: { name: '✅' } },
        { type: 2, style: 2, label: 'Transcript', custom_id: 'ticket_transcript', emoji: { name: '📜' } },
        { type: 2, style: 4, label: 'Close', custom_id: 'ticket_close', emoji: { name: '🔒' } }
      ]
    };

    // Post starter message into new ticket channel
    await discordFetch('/channels/' + newTicketChannel.id + '/messages', {
      method: 'POST',
      body: JSON.stringify({
        content: '👋 Welcome <@' + userId + '>! An official inquiry has been opened for <@&' + STAFF_ROLE_ID + '>.',
        embeds: [ticketEmbed],
        components: [staffRow1]
      })
    });

    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: '✅ **Ticket initialized!** Your case room has been created in <#' + newTicketChannel.id + '>.',
        flags: 64
      }
    };
  } catch (err) {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: '❌ **Failed to create ticket room:** ' + err.message,
        flags: 64
      }
    };
  }
}

// ----------------------------------------------------
// TICKET STAFF ACTIONS (CLAIM, INVESTIGATE, RESOLVE, CLOSE, ETC)
// ----------------------------------------------------
async function handleTicketStaffAction(interaction, action) {
  const channelId = interaction.channel_id;
  const member = interaction.member;
  const userId = member?.user?.id;

  if (!isStaff(member)) {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: '❌ **Access Denied:** Only <@&' + STAFF_ROLE_ID + '> can perform actions on this ticket.', flags: 64 }
    };
  }

  if (action === 'ticket_claim') {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [{
          title: '🛡️ CASE CLAIMED BY STAFF',
          description: '<@' + userId + '> has officially taken ownership of this investigation. All inquiries will be handled directly.',
          color: VOID_ACCENT_COLOR,
          timestamp: new Date().toISOString()
        }]
      }
    };
  }

  if (action === 'ticket_investigate') {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [{
          title: '🔍 STATUS UPDATE: UNDER INVESTIGATION',
          description: 'Staff is currently reviewing in-game server logs, clip footage, and database records regarding this matter.',
          color: 0xFEE75C,
          timestamp: new Date().toISOString()
        }]
      }
    };
  }

  if (action === 'ticket_resolve') {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [{
          title: '✅ CASE CONCLUDED & RESOLVED',
          description: 'This case has been marked as **RESOLVED** by <@' + userId + '>. Citizen inquiry is complete.',
          color: 0x57F287,
          timestamp: new Date().toISOString()
        }]
      }
    };
  }

  if (action === 'ticket_transcript') {
    try {
      const messages = await discordFetch('/channels/' + channelId + '/messages?limit=100');
      const lines = messages.reverse().map(m => '[' + new Date(m.timestamp).toLocaleTimeString() + '] ' + (m.author?.username || 'Unknown') + ': ' + (m.content || '[Embed/Attachment]'));
      const transcriptText = lines.join('\n');

      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: '📜 **VOID Roleplay Official Case Transcript Generated:**\n```text\n' + transcriptText.slice(0, 1900) + '\n```',
          flags: 64
        }
      };
    } catch (err) {
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '❌ Failed to generate transcript: ' + err.message, flags: 64 }
      };
    }
  }

  if (action === 'ticket_close') {
    try {
      if (CLOSED_CATEGORY_ID) {
        await discordFetch('/channels/' + channelId, {
          method: 'PATCH',
          body: JSON.stringify({ parent_id: CLOSED_CATEGORY_ID })
        });
      }
    } catch (e) {
      console.error('Failed to move to closed category:', e);
    }

    const closeEmbed = {
      title: '🔒 TICKET CLOSED & ARCHIVED',
      description: 'This ticket was closed by <@' + userId + '> and moved to <#' + CLOSED_CATEGORY_ID + '>.\nHigh Command can reopen this inquiry or permanently delete this channel.',
      color: 0xED4245,
      timestamp: new Date().toISOString()
    };

    const closeRow = {
      type: 1,
      components: [
        { type: 2, style: 2, label: 'Reopen Ticket', custom_id: 'ticket_reopen', emoji: { name: '🔓' } },
        { type: 2, style: 4, label: 'Delete Channel', custom_id: 'ticket_delete', emoji: { name: '🗑️' } }
      ]
    };

    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [closeEmbed],
        components: [closeRow]
      }
    };
  }

  if (action === 'ticket_reopen') {
    try {
      if (TICKETS_CATEGORY_ID) {
        await discordFetch('/channels/' + channelId, {
          method: 'PATCH',
          body: JSON.stringify({ parent_id: TICKETS_CATEGORY_ID })
        });
      }
    } catch (e) {
      console.error('Failed to move back to open category:', e);
    }

    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [{
          title: '🔓 TICKET REOPENED',
          description: 'This case room was reopened by <@' + userId + '> and moved back to <#' + TICKETS_CATEGORY_ID + '>.',
          color: 0x57F287
        }]
      }
    };
  }

  if (action === 'ticket_delete') {
    try {
      await discordFetch('/channels/' + channelId, { method: 'DELETE' });
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '🗑️ Deleting ticket room...', flags: 64 }
      };
    } catch (err) {
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '❌ Failed to delete channel: ' + err.message, flags: 64 }
      };
    }
  }

  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content: 'Action acknowledged.', flags: 64 }
  };
}

// ----------------------------------------------------
// VOICE PANEL ACTION HANDLER (BUTTONS)
// ----------------------------------------------------
async function handleVoicePanelAction(interaction, action) {
  const guildId = interaction.guild_id;
  const member = interaction.member;
  const userId = member?.user?.id;

  let voiceChannelId = null;
  try {
    const guild = await discordFetch('/guilds/' + guildId + '?with_counts=false');
    const vs = (guild.voice_states || []).find(v => v.user_id === userId);
    if (vs) voiceChannelId = vs.channel_id;
  } catch (_) {}

  if (!voiceChannelId) {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: '⚠️ You must be connected to a voice channel to use Patrol Room controls.',
        flags: 64
      }
    };
  }

  if (action === 'vc_panel_lock') {
    try {
      await discordFetch('/channels/' + voiceChannelId + '/permissions/' + guildId, {
        method: 'PUT',
        body: JSON.stringify({ allow: '0', deny: PERM_FLAGS.connect.toString(), type: 0 })
      });
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '🔒 **Patrol Room Locked.** No additional citizens may enter.', flags: 64 }
      };
    } catch (err) {
      return { type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: '❌ Failed: ' + err.message, flags: 64 } };
    }
  }

  if (action === 'vc_panel_unlock') {
    try {
      await discordFetch('/channels/' + voiceChannelId + '/permissions/' + guildId, { method: 'DELETE' });
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '🔓 **Patrol Room Unlocked.** All citizens can join.', flags: 64 }
      };
    } catch (err) {
      return { type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: '❌ Failed: ' + err.message, flags: 64 } };
    }
  }

  if (action === 'vc_panel_delete') {
    try {
      await discordFetch('/channels/' + voiceChannelId, { method: 'DELETE' });
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '❌ **Patrol Room Decommissioned.**', flags: 64 }
      };
    } catch (err) {
      return { type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: '❌ Failed: ' + err.message, flags: 64 } };
    }
  }

  if (action === 'vc_panel_mute' || action === 'vc_panel_unmute' || action === 'vc_panel_kick' || action === 'vc_panel_limit' || action === 'vc_panel_rename') {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: '💡 Use `/vc ' + action.replace('vc_panel_', '') + '` to specify targets or parameters for this operation.',
        flags: 64
      }
    };
  }

  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content: 'Voice panel operation acknowledged.', flags: 64 }
  };
}
