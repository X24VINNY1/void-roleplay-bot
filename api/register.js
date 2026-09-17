const DISCORD_API = 'https://discord.com/api/v10';

export async function GET(request) {
  return handleRegister();
}

export async function POST(request) {
  return handleRegister();
}

export default async function handler(req, res) {
  const result = await runRegistration();
  if (res && typeof res.status === 'function') {
    return res.status(result.status).json(result.data);
  }
  return new Response(JSON.stringify(result.data), {
    status: result.status,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleRegister() {
  const result = await runRegistration();
  return new Response(JSON.stringify(result.data), {
    status: result.status,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function runRegistration() {
  const token = process.env.DISCORD_TOKEN;
  const appId = process.env.DISCORD_APP_ID;

  if (!token || !appId) {
    return {
      status: 400,
      data: { error: 'Missing DISCORD_TOKEN or DISCORD_APP_ID in Environment Variables.' }
    };
  }

  const commands = [
    {
      name: 'setup-tickets',
      description: 'Deploy the VOID Roleplay Support & Ticket Station',
      type: 1,
      options: [
        { name: 'channel', description: 'Channel to deploy ticket station to (default: current channel)', type: 7, required: false }
      ]
    },
    {
      name: 'setup-verify',
      description: 'Deploy the VOID Roleplay Citizen Verification Station',
      type: 1,
      options: [
        { name: 'channel', description: 'Channel to deploy verification station to', type: 7, required: false },
        { name: 'role', description: 'Role granted upon verification (e.g. Citizen role)', type: 8, required: false }
      ]
    },
    {
      name: 'verify',
      description: 'Verify your account to receive Citizen role and unlock city channels',
      type: 1
    },
    {
      name: 'setup-voice-panel',
      description: 'Deploy the VOID Roleplay Master Patrol & Squad Voice Control Panel',
      type: 1,
      options: [
        { name: 'channel', description: 'Channel to deploy voice control panel to', type: 7, required: false }
      ]
    },
    {
      name: 'vc',
      description: 'Patrol / Squad Room Controls (Lock, Unlock, Mute, Kick, Limit, Rename, Delete)',
      type: 1,
      options: [
        {
          name: 'create',
          description: 'Create your private squad / patrol room',
          type: 1,
          options: [
            { name: 'name', description: 'Patrol or squad name (e.g. LSPD Patrol 2, Vagos Hangout)', type: 3, required: false },
            { name: 'limit', description: 'Player limit (0 for unlimited, 2-99)', type: 4, required: false }
          ]
        },
        { name: 'lock', description: 'Lock your squad room from other citizens', type: 1 },
        { name: 'unlock', description: 'Unlock your squad room', type: 1 },
        {
          name: 'mute',
          description: 'Mute a user in your voice room',
          type: 1,
          options: [{ name: 'user', description: 'Member to mute', type: 6, required: true }]
        },
        {
          name: 'unmute',
          description: 'Unmute a member in your voice room',
          type: 1,
          options: [{ name: 'user', description: 'Member to unmute', type: 6, required: true }]
        },
        {
          name: 'kick',
          description: 'Disconnect a user from your voice room',
          type: 1,
          options: [{ name: 'user', description: 'Member to disconnect', type: 6, required: true }]
        },
        {
          name: 'limit',
          description: 'Set player limit for your squad room',
          type: 1,
          options: [{ name: 'amount', description: 'Max slots (0-99)', type: 4, required: true }]
        },
        {
          name: 'rename',
          description: 'Rename your squad room',
          type: 1,
          options: [{ name: 'name', description: 'New room name', type: 3, required: true }]
        },
        { name: 'delete', description: 'Delete your squad room', type: 1 }
      ]
    },
    {
      name: 'automod',
      description: 'VOID Roleplay Anti-Raid, Anti-Invite & Phishing Security Shield',
      type: 1,
      options: [
        {
          name: 'setup',
          description: 'Deploy 4-layer Auto-Mod shields (Anti-Invite, Anti-Phishing, Anti-Spam, Mention Shield)',
          type: 1,
          options: [
            { name: 'log_channel', description: 'Security alert log channel', type: 7, required: false },
            { name: 'timeout_minutes', description: 'Offender timeout duration in minutes (default: 60)', type: 4, required: false }
          ]
        },
        { name: 'status', description: 'View active security shield status and rules', type: 1 },
        {
          name: 'disable',
          description: 'Disable a specific security shield',
          type: 1,
          options: [
            {
              name: 'shield',
              description: 'Shield to disable',
              type: 3,
              required: true,
              choices: [
                { name: 'All Shields', value: 'all' },
                { name: 'Anti-Invite Shield', value: 'invite' },
                { name: 'Anti-Phishing & Scam Shield', value: 'scam' },
                { name: 'Anti-Mass Mention Shield', value: 'mentions' },
                { name: 'Anti-Spam Shield', value: 'spam' }
              ]
            }
          ]
        },
        {
          name: 'enable',
          description: 'Enable a specific security shield',
          type: 1,
          options: [
            {
              name: 'shield',
              description: 'Shield to enable',
              type: 3,
              required: true,
              choices: [
                { name: 'All Shields', value: 'all' },
                { name: 'Anti-Invite Shield', value: 'invite' },
                { name: 'Anti-Phishing & Scam Shield', value: 'scam' },
                { name: 'Anti-Mass Mention Shield', value: 'mentions' },
                { name: 'Anti-Spam Shield', value: 'spam' }
              ]
            }
          ]
        }
      ]
    },
    {
      name: 'city-status',
      description: 'Broadcast FiveM Server Status Card (Online, Restarting, Queue)',
      type: 1,
      options: [
        {
          name: 'status',
          description: 'City server status',
          type: 3,
          required: true,
          choices: [
            { name: '?? Server Online & Open', value: 'online' },
            { name: '?? Scheduled Server Restart (5 Mins)', value: 'restart' },
            { name: '?? Server Offline / Maintenance', value: 'offline' },
            { name: '? High Queue / Priority Active', value: 'queue' }
          ]
        },
        { name: 'connect_ip', description: 'FiveM Connect cfx.re link or IP (e.g. cfx.re/join/xxxxxx)', type: 3, required: false },
        { name: 'player_count', description: 'Current player count (e.g. 128/128)', type: 3, required: false }
      ]
    },
    {
      name: 'channel',
      description: 'Server channel management commands',
      type: 1,
      options: [
        {
          name: 'create',
          description: 'Create a text or voice channel',
          type: 1,
          options: [
            { name: 'name', description: 'Channel name', type: 3, required: true },
            {
              name: 'type',
              description: 'Channel type',
              type: 3,
              required: false,
              choices: [
                { name: 'Text', value: 'text' },
                { name: 'Voice', value: 'voice' }
              ]
            }
          ]
        },
        { name: 'delete', description: 'Delete current channel', type: 1 },
        {
          name: 'purge',
          description: 'Clear messages in this channel',
          type: 1,
          options: [{ name: 'amount', description: 'Number of messages (1-100)', type: 4, required: true }]
        },
        { name: 'lock', description: 'Lock this channel for citizens', type: 1 },
        { name: 'unlock', description: 'Unlock this channel', type: 1 }
      ]
    },
    {
      name: 'role',
      description: 'VOID Roleplay Role Maker & Permissions (Staff Only)',
      type: 1,
      options: [
        {
          name: 'create',
          description: 'Create a custom server role (e.g. Police, EMS, Gang, VIP)',
          type: 1,
          options: [
            { name: 'name', description: 'Role name', type: 3, required: true },
            { name: 'color', description: 'Color hex or name (#9B59B6, purple, blue, red, gold)', type: 3, required: false },
            {
              name: 'permissions',
              description: 'Preset permissions',
              type: 3,
              required: false,
              choices: [
                { name: '?? Admin (Full Administrator)', value: 'admin' },
                { name: '??? Moderator / Staff (Manage Messages, Timeout)', value: 'mod' },
                { name: '?? Citizen / Member (Standard Chat)', value: 'member' },
                { name: '??? Read Only (View Channels)', value: 'readonly' }
              ]
            }
          ]
        },
        {
          name: 'give',
          description: 'Assign role to a member',
          type: 1,
          options: [
            { name: 'user', description: 'Member to receive role', type: 6, required: true },
            { name: 'role', description: 'Role to assign', type: 8, required: true }
          ]
        },
        {
          name: 'remove',
          description: 'Remove role from a member',
          type: 1,
          options: [
            { name: 'user', description: 'Member to remove role from', type: 6, required: true },
            { name: 'role', description: 'Role to remove', type: 8, required: true }
          ]
        },
        {
          name: 'delete',
          description: 'Permanently delete a role',
          type: 1,
          options: [{ name: 'role', description: 'Role to delete', type: 8, required: true }]
        },
        { name: 'list', description: 'List all server roles', type: 1 }
      ]
    },
    {
      name: 'autorole',
      description: 'VOID Roleplay Auto-Role Engine (Auto-assign Citizen role)',
      type: 1,
      options: [
        {
          name: 'set',
          description: 'Set automatic role granted when members join',
          type: 1,
          options: [{ name: 'role', description: 'Role to auto-grant', type: 8, required: true }]
        },
        { name: 'check', description: 'Check configured auto-role', type: 1 },
        { name: 'remove', description: 'Disable auto-role', type: 1 }
      ]
    },
    {
      name: 'blacklist',
      description: 'VOID Roleplay Blacklist & Anti-Troll Engine',
      type: 1,
      options: [
        {
          name: 'add',
          description: 'Blacklist a user from opening tickets',
          type: 1,
          options: [
            { name: 'user', description: 'User to blacklist', type: 6, required: true },
            { name: 'reason', description: 'Reason for blacklist (e.g. Troll, Mass Ping, Toxic)', type: 3, required: false }
          ]
        },
        {
          name: 'remove',
          description: 'Remove a user from the blacklist',
          type: 1,
          options: [{ name: 'user', description: 'User to unblacklist', type: 6, required: true }]
        },
        {
          name: 'check',
          description: 'Check if user is blacklisted',
          type: 1,
          options: [{ name: 'user', description: 'User to check', type: 6, required: true }]
        },
        { name: 'list', description: 'List all blacklisted users', type: 1 }
      ]
    }
  ];

  try {
    // 1. Sync to joined guilds for instant zero-delay access
    const guildsRes = await fetch(DISCORD_API + '/users/@me/guilds', {
      headers: { 'Authorization': 'Bot ' + token }
    });
    const guildSyncResults = [];
    if (guildsRes.ok) {
      const guilds = await guildsRes.json().catch(() => []);
      for (const g of guilds) {
        const gRes = await fetch(DISCORD_API + '/applications/' + appId + '/guilds/' + g.id + '/commands', {
          method: 'PUT',
          headers: { 'Authorization': 'Bot ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify(commands)
        });
        guildSyncResults.push(g.name + ' (' + g.id + '): ' + gRes.status);
      }
    }

    // 2. Global Sync
    const globalUrl = DISCORD_API + '/applications/' + appId + '/commands';
    const res = await fetch(globalUrl, {
      method: 'PUT',
      headers: { 'Authorization': 'Bot ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands)
    });

    if (!res.ok) {
      const err = await res.text();
      return { status: res.status, data: { error: 'Discord API error: ' + err } };
    }

    const data = await res.json();
    return {
      status: 200,
      data: {
        success: true,
        message: 'Successfully registered ' + data.length + ' VOID Roleplay slash commands globally and to ' + guildSyncResults.length + ' guild(s)!',
        guilds: guildSyncResults,
        commands: data.map(c => '/' + c.name)
      }
    };
  } catch (e) {
    return { status: 500, data: { error: e.message } };
  }
}
