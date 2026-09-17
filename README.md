# 🌌 VOID Roleplay — FiveM Discord Bot & City Operations Hub

Custom Discord bot built for **VOID Roleplay** (FiveM / GTA V RP). Built for citizen immigration screening, in-depth staff ticket investigations, patrol frequencies, native Discord Auto-Mod protection, and city status broadcasts.

---

## ⚡ Features & Modules

### 1. 🛡️ Citizen Verification Station (`/setup-verify`, `/verify`)
- Deploys an automated gatekeeper terminal with 1-click verification.
- Assigns the **Citizen** role to unlock city chat and patrol frequencies.

### 2. 📋 7-Department RP Ticket Station (`/setup-tickets`)
Equipped with dedicated modal intake forms tailored for FiveM server operations:
- **Whitelist Application** — Character name, age, in-game backstory, Steam Hex, and RP experience.
- **Player Report (RDM / VDM / FailRP)** — Reporter ID, accused ID, broken rules, and video clip proof link.
- **Ban Appeal** — Banned character / Steam Hex, ban reason, staff name, and appeal justification.
- **Gang & Faction Registration** — Syndicate name, leader tag, turf location, lore, and member roster.
- **Business & MLO Proposals** — Commercial concept, owner ID, requested MLO location, and RP impact.
- **Bug & Glitch Reports** — Bug description, reproduction steps, and console log/clip evidence.
- **General City Support** — Character queries, lost items, and general assistance.

### 3. 🔍 High Command Case Progression Flow
Staff action controls integrated inside every ticket room:
- `🛡️ Claim Ticket` — Assigns ticket ownership to responding staff member.
- `🔍 In Investigation` — Updates status while reviewing server logs and video clips.
- `✅ Resolve Case` — Marks investigation complete.
- `📜 Transcript` — Compiles and renders full message history.
- `🔒 Close` / `🔓 Reopen` / `🗑️ Delete` — Ticket lifecycle management.

### 4. 🔊 Patrol & Squad Voice Manager (`/setup-voice-panel`, `/vc`)
- **Join-to-Create Automation**: Automatically creates `🔊 [Citizen]'s Patrol` when joining the trigger channel and moves them instantly.
- **24/7 Cloud Auto-Cleanup**: Automatically cleans up and deletes channels when squads disconnect.
- **Patrol Controls**: Lock, unlock, mute, unmute, disconnect/kick, player limit (2-99), rename, and delete.

### 5. 🛡️ 4-Layer Auto-Mod Anti-Raid Shield (`/automod setup/status`)
- Native Discord AutoMod engine blocks server invite links, phishing/scams, spam attacks, and mass mentions.

### 6. 🟢 FiveM City Server Status Broadcast (`/city-status`)
- Broadcasts server status cards for Server Online (with CFX direct connect link and player count), Scheduled Restart / Tsunami (5 min countdown), Maintenance / Offline, and High Queue alerts.

### 7. 🛠️ Server Administration (`/channel`, `/role`, `/autorole`, `/blacklist`)
- In-depth role generator with permission presets, message purger, auto-role assigner, and anti-troll ticket blacklist.
