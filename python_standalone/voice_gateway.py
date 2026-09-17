import discord
from discord.ext import commands
import os
import sys
import json
import asyncio

def get_token():
    env_token = os.environ.get("DISCORD_TOKEN")
    if env_token and len(env_token) > 30:
        return env_token.strip()
    if len(sys.argv) > 1 and len(sys.argv[1]) > 30:
        return sys.argv[1].strip()
    cfg_path = os.path.join(os.path.dirname(__file__), "config.json")
    if os.path.exists(cfg_path):
        try:
            with open(cfg_path, "r", encoding="utf-8-sig") as f:
                cfg = json.load(f)
                if cfg.get("token") and len(cfg.get("token")) > 30:
                    return cfg.get("token").strip()
        except Exception:
            pass
    return None

intents = discord.Intents.default()
intents.guilds = True
intents.voice_states = True

bot = commands.Bot(command_prefix="!void", intents=intents, help_command=None)
created_rooms = {}

def get_join_to_create_id():
    env_id = os.environ.get("JOIN_TO_CREATE_VC_ID")
    if env_id and env_id.strip().isdigit():
        return int(env_id.strip())
    return None

@bot.event
async def on_ready():
    print("=" * 65)
    print(f" [OK] VOID Roleplay Voice & Patrol Gateway Online: {bot.user} (ID: {bot.user.id})")
    print(" [OK] 24/7 Join-to-Create Squad & Patrol Auto-Provisioner Active")
    print("=" * 65)
    await bot.change_presence(
        activity=discord.Activity(
            type=discord.ActivityType.watching,
            name="VOID Roleplay | Patrol Radio"
        )
    )

@bot.event
async def on_voice_state_update(member, before, after):
    join_target_id = get_join_to_create_id()

    # Match by ID or by channel name containing "join to create"
    is_join_trigger = False
    if after.channel:
        if join_target_id and after.channel.id == join_target_id:
            is_join_trigger = True
        elif not join_target_id and "join to create" in after.channel.name.lower():
            is_join_trigger = True

    if is_join_trigger:
        guild = member.guild
        category = after.channel.category
        room_name = f"🔊 {member.display_name}'s Patrol"

        overwrites = {
            guild.default_role: discord.PermissionOverwrite(connect=True, speak=True),
            member: discord.PermissionOverwrite(
                connect=True,
                speak=True,
                manage_channels=True,
                move_members=True,
                mute_members=True,
                deafen_members=True
            )
        }

        try:
            new_channel = await guild.create_voice_channel(
                name=room_name,
                category=category,
                overwrites=overwrites,
                user_limit=0,
                reason="VOID Roleplay: Join-to-Create Patrol Channel"
            )
            created_rooms[new_channel.id] = member.id
            print(f"[+] Created Patrol Room {room_name} ({new_channel.id}) for {member.display_name}")

            await member.move_to(new_channel, reason="VOID Roleplay: Dispatched to squad channel")
            print(f"[+] Successfully moved {member.display_name} into {new_channel.name}")
        except Exception as e:
            print(f"[-] Failed to create/move room for {member.display_name}: {e}")

    # Auto-cleanup when empty
    if before.channel:
        ch = before.channel
        is_trigger_channel = (join_target_id and ch.id == join_target_id) or ("join to create" in ch.name.lower())
        if not is_trigger_channel:
            is_patrol_room = (ch.id in created_rooms) or ("'s Patrol" in ch.name) or ("'s Squad" in ch.name)
            if is_patrol_room and len(ch.members) == 0:
                try:
                    await ch.delete(reason="VOID Roleplay: Auto-cleanup empty patrol room")
                    if ch.id in created_rooms:
                        del created_rooms[ch.id]
                    print(f"[+] Auto-deleted empty patrol room: {ch.name} ({ch.id})")
                except Exception as e:
                    print(f"[-] Failed to delete empty room {ch.id}: {e}")

def main():
    token = get_token()
    if not token or token.startswith("PASTE_"):
        print("[-] Error: No valid Discord Bot Token found!")
        print("[-] Set DISCORD_TOKEN environment variable.")
        sys.exit(1)
    bot.run(token)

if __name__ == "__main__":
    main()
