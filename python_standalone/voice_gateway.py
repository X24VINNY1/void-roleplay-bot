import discord
from discord.ext import commands
from discord import ui
import os
import sys
import json
import asyncio
import datetime
import io

# ----------------------------------------------------
# CONFIG & AUTH
# ----------------------------------------------------
VOID_THEME_COLOR = 0x7B2CBF  # Neon Void Purple
VOID_ACCENT_COLOR = 0x9D4EDD
SUCCESS_COLOR = 0x57F287
WARN_COLOR = 0xFEE75C
DANGER_COLOR = 0xED4245

OPEN_TICKETS_CATEGORY_ID = 1452274275552723099
CLOSED_TICKETS_CATEGORY_ID = 1549979830068580373
STAFF_ROLE_ID = 1452274255294234665
TRANSCRIPTS_CHANNEL_ID = 1540878462305312879

BLACKLIST_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "blacklist.json")
AUTOROLE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "autorole.json")

def load_blacklist():
    if os.path.exists(BLACKLIST_FILE):
        try:
            with open(BLACKLIST_FILE, "r", encoding="utf-8") as f:
                raw = json.load(f)
                return {int(x) for x in raw if str(x).isdigit()}
        except Exception:
            pass
    return set()

def save_blacklist(data_set):
    try:
        with open(BLACKLIST_FILE, "w", encoding="utf-8") as f:
            json.dump([int(x) for x in data_set], f, indent=2)
    except Exception as e:
        print(f"[-] Failed to save blacklist: {e}")

blacklist_cache = load_blacklist()

def load_autorole():
    if os.path.exists(AUTOROLE_FILE):
        try:
            with open(AUTOROLE_FILE, "r", encoding="utf-8") as f:
                raw = json.load(f)
                return {int(k): int(v) for k, v in raw.items() if str(k).isdigit() and str(v).isdigit()}
        except Exception:
            pass
    return {}

def save_autorole(data_dict):
    try:
        with open(AUTOROLE_FILE, "w", encoding="utf-8") as f:
            json.dump({str(k): int(v) for k, v in data_dict.items()}, f, indent=2)
    except Exception as e:
        print(f"[-] Failed to save autorole: {e}")

autorole_cache = load_autorole()

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
intents.message_content = True
intents.members = True

bot = commands.Bot(command_prefix="!void", intents=intents, help_command=None)
created_rooms = {}

def is_staff(member: discord.Member) -> bool:
    if not member:
        return False
    if any(r.id == STAFF_ROLE_ID for r in getattr(member, 'roles', [])):
        return True
    perms = getattr(member, 'guild_permissions', None)
    if perms and perms.administrator:
        return True
    return False

def is_blacklisted(member: discord.Member) -> bool:
    if not member:
        return False
    if member.id in blacklist_cache or int(member.id) in blacklist_cache:
        return True
    return any(r.name.lower() in ["blacklisted", "ticket ban", "ticket banned"] for r in getattr(member, 'roles', []))

# ----------------------------------------------------
# TICKET MODALS
# ----------------------------------------------------
class WhitelistModal(ui.Modal, title="VOID Whitelist Application"):
    name_age = ui.TextInput(label="Character Full Name & Age", placeholder="e.g. Marcus Vance, 28", required=True)
    steam_hex = ui.TextInput(label="Steam Hex ID / CFX Account", placeholder="steam:1100001xxxxxxxx", required=True)
    backstory = ui.TextInput(label="Character Backstory & Motivation", style=discord.TextStyle.paragraph, placeholder="Explain character origin, history, and goals in the city...", required=True)
    rp_exp = ui.TextInput(label="Prior FiveM RP Experience", style=discord.TextStyle.paragraph, placeholder="Past servers and roleplay background...", required=True)

    async def on_submit(self, interaction: discord.Interaction):
        await create_ticket_channel(interaction, "whitelist-", "📋 Whitelist Application", "High Command / Whitelist Staff", {
            "Character Name & Age": self.name_age.value,
            "Steam Hex / CFX": self.steam_hex.value,
            "Backstory & Goals": self.backstory.value,
            "Prior RP Experience": self.rp_exp.value
        })

class ReportModal(ui.Modal, title="Player Incident / Rulebreak Report"):
    reporter = ui.TextInput(label="Your Character Name & In-Game ID", placeholder="e.g. Dominic Toretto | ID #42", required=True)
    reported = ui.TextInput(label="Accused Player Name / ID / Steam Hex", placeholder="e.g. ID #88 or Masked player in black Sultan", required=True)
    rule = ui.TextInput(label="Rule Broken (RDM, VDM, FailRP, etc.)", placeholder="e.g. RDM at Legion Square & Combat Logging", required=True)
    summary = ui.TextInput(label="Incident Summary & Timeline", style=discord.TextStyle.paragraph, placeholder="Explain what transpired leading up to the rulebreak...", required=True)
    clip = ui.TextInput(label="Video Clip Link (Mandatory Proof)", placeholder="https://medal.tv/clip/... or YouTube / Streamable", required=True)

    async def on_submit(self, interaction: discord.Interaction):
        await create_ticket_channel(interaction, "report-", "🚨 Player Rulebreak Report", "Staff Team", {
            "Reporter Info": self.reporter.value,
            "Accused Player": self.reported.value,
            "Rule Broken": self.rule.value,
            "Incident Summary": self.summary.value,
            "Video Clip Proof": self.clip.value
        })

class AppealModal(ui.Modal, title="VOID Roleplay Ban Appeal"):
    identity = ui.TextInput(label="Banned Character / Steam Hex", placeholder="steam:1100001xxxxxxxx / Character Name", required=True)
    reason = ui.TextInput(label="Ban Reason & Banning Staff Member", placeholder="e.g. Banned for VDM by Staff", required=True)
    justification = ui.TextInput(label="Why should your ban be lifted?", style=discord.TextStyle.paragraph, placeholder="Explain your side and why you should be unbanned...", required=True)

    async def on_submit(self, interaction: discord.Interaction):
        await create_ticket_channel(interaction, "appeal-", "⚖️ Ban Appeal", "High Command / Senior Staff", {
            "Banned Player Info": self.identity.value,
            "Ban Reason / Staff": self.reason.value,
            "Appeal Justification": self.justification.value
        })

class GangModal(ui.Modal, title="Gang & Faction Registration"):
    gang_name = ui.TextInput(label="Gang / Syndicate Name", placeholder="e.g. Marabunta Grande / 67th Street Mafia", required=True)
    leader = ui.TextInput(label="Leader Character Name & Discord Tag", placeholder="e.g. Carlos Mendez (@carlos)", required=True)
    turf = ui.TextInput(label="Claimed Turf / Neighborhood Location", placeholder="e.g. El Burro Heights / Brouge Avenue", required=True)
    roster = ui.TextInput(label="Lore & Active Member Roster", style=discord.TextStyle.paragraph, placeholder="Brief history and list of founding member IDs...", required=True)

    async def on_submit(self, interaction: discord.Interaction):
        await create_ticket_channel(interaction, "gang-", "🏴 Gang Registration", "Gang High Command", {
            "Gang / Syndicate Name": self.gang_name.value,
            "Leader Info": self.leader.value,
            "Claimed Turf": self.turf.value,
            "Lore & Roster": self.roster.value
        })

class BusinessModal(ui.Modal, title="Business & MLO Proposal"):
    biz_name = ui.TextInput(label="Business / Enterprise Name", placeholder="e.g. Hayes Customs / Bean Machine", required=True)
    owner = ui.TextInput(label="Owner Character Name & ID", placeholder="e.g. Anthony Soprano | ID #14", required=True)
    location = ui.TextInput(label="Requested Location / Custom MLO details", placeholder="Coordinates, address, or custom MLO pack link...", required=True)
    concept = ui.TextInput(label="Business Plan & Citizen RP Impact", style=discord.TextStyle.paragraph, placeholder="How will this business create roleplay opportunities?", required=True)

    async def on_submit(self, interaction: discord.Interaction):
        await create_ticket_channel(interaction, "biz-", "🏢 Business Proposal", "City Council / Economy High Command", {
            "Business Name": self.biz_name.value,
            "Owner Info": self.owner.value,
            "Location / MLO": self.location.value,
            "Concept & RP Impact": self.concept.value
        })

class BugModal(ui.Modal, title="Bug & Glitch Report"):
    summary = ui.TextInput(label="Bug Summary / Script Area", placeholder="e.g. Inventory duping, Garage vehicle despawn", required=True)
    steps = ui.TextInput(label="Steps to Reproduce", style=discord.TextStyle.paragraph, placeholder="1. Go to garage\n2. Pull vehicle...\n3. Observe error...", required=True)
    evidence = ui.TextInput(label="Console Log / Screenshot / Clip link", placeholder="Imgur / Medal / YouTube link", required=False)

    async def on_submit(self, interaction: discord.Interaction):
        await create_ticket_channel(interaction, "bug-", "🐛 Bug & Glitch Report", "Development Team", {
            "Bug Area": self.summary.value,
            "Steps to Reproduce": self.steps.value,
            "Evidence Link": self.evidence.value or "None provided"
        })

class SupportModal(ui.Modal, title="VOID General City Support"):
    char_id = ui.TextInput(label="Character Name & In-Game ID", placeholder="e.g. Tyler Durden | ID #77", required=True)
    details = ui.TextInput(label="Explain your issue or question", style=discord.TextStyle.paragraph, placeholder="Detail your issue so staff can assist you immediately...", required=True)

    async def on_submit(self, interaction: discord.Interaction):
        await create_ticket_channel(interaction, "support-", "❓ General City Support", "Support Staff", {
            "Character Info": self.char_id.value,
            "Issue Details": self.details.value
        })

# ----------------------------------------------------
# VIEWS & BUTTON CONTROLS
# ----------------------------------------------------
class TicketStationView(ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @ui.select(
        custom_id="ticket_category_select",
        placeholder="⚡ Choose a Department to open a ticket...",
        options=[
            discord.SelectOption(label="Player Report (RDM / VDM / FailRP)", value="ticket_cat_report", description="Report rulebreaks with video evidence clip", emoji="🚨"),
            discord.SelectOption(label="Ban Appeal", value="ticket_cat_appeal", description="Request formal review of an active server ban", emoji="⚖️"),
            discord.SelectOption(label="Gang & Faction Registration", value="ticket_cat_gang", description="Register gang name, leader, turf, and roster", emoji="🏴"),
            discord.SelectOption(label="Business & MLO Proposals", value="ticket_cat_business", description="Submit business concept or custom MLO proposal", emoji="🏢"),
            discord.SelectOption(label="Bug & Glitch Report", value="ticket_cat_bug", description="Report city bugs, mapping glitches, or exploits", emoji="🐛"),
            discord.SelectOption(label="General City Support", value="ticket_cat_support", description="Character inquiries, general questions, and help", emoji="❓")
        ]
    )
    async def select_callback(self, interaction: discord.Interaction, select: ui.Select):
        if is_blacklisted(interaction.user):
            await interaction.response.send_message("⛔ **Access Denied:** You are currently blacklisted from opening tickets in VOID Roleplay.", ephemeral=True)
            return

        val = select.values[0]
        if val == "ticket_cat_report":
            await interaction.response.send_modal(ReportModal())
        elif val == "ticket_cat_appeal":
            await interaction.response.send_modal(AppealModal())
        elif val == "ticket_cat_gang":
            await interaction.response.send_modal(GangModal())
        elif val == "ticket_cat_business":
            await interaction.response.send_modal(BusinessModal())
        elif val == "ticket_cat_bug":
            await interaction.response.send_modal(BugModal())
        else:
            await interaction.response.send_modal(SupportModal())

class VerifyStationView(ui.View):
    def __init__(self, target_role_id: int = None):
        super().__init__(timeout=None)
        self.target_role_id = target_role_id

    @ui.button(label="Verify Citizen Status", style=discord.ButtonStyle.success, emoji="✅", custom_id="verify_citizen_btn")
    async def verify_btn(self, interaction: discord.Interaction, button: ui.Button):
        guild = interaction.guild
        member = interaction.user
        role = None

        if self.target_role_id:
            role = guild.get_role(self.target_role_id)
        if not role:
            role = discord.utils.find(lambda r: r.name.lower() in ["citizen", "verified"], guild.roles)

        if not role:
            await interaction.response.send_message("⚠️ Citizen role not found. Please notify Server Staff to configure `/setup-verify`.", ephemeral=True)
            return

        try:
            await member.add_roles(role, reason="VOID Roleplay: Citizen Verification Completed")
            await interaction.response.send_message(f"✅ **Verification Confirmed!** You have been granted the {role.mention} role. Welcome to VOID Roleplay!", ephemeral=True)
        except Exception as e:
            await interaction.response.send_message(f"❌ Failed to assign role: {e}", ephemeral=True)

class TicketControlsView(ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @ui.button(label="Claim Ticket", style=discord.ButtonStyle.primary, emoji="🛡️", custom_id="ticket_claim")
    async def claim_btn(self, interaction: discord.Interaction, button: ui.Button):
        if not is_staff(interaction.user):
            await interaction.response.send_message(f"❌ **Access Denied:** Only <@&{STAFF_ROLE_ID}> can manage this ticket.", ephemeral=True)
            return
        embed = discord.Embed(
            title="🛡️ CASE CLAIMED BY STAFF",
            description=f"{interaction.user.mention} has taken ownership of this investigation. All inquiries will be handled directly.",
            color=VOID_ACCENT_COLOR,
            timestamp=datetime.datetime.now(datetime.timezone.utc)
        )
        await interaction.response.send_message(embed=embed)

    @ui.button(label="In Investigation", style=discord.ButtonStyle.secondary, emoji="🔍", custom_id="ticket_investigate")
    async def investigate_btn(self, interaction: discord.Interaction, button: ui.Button):
        if not is_staff(interaction.user):
            await interaction.response.send_message(f"❌ **Access Denied:** Only <@&{STAFF_ROLE_ID}> can manage this ticket.", ephemeral=True)
            return
        embed = discord.Embed(
            title="🔍 STATUS UPDATE: UNDER INVESTIGATION",
            description="Staff is currently reviewing server logs, database records, and video proof.",
            color=WARN_COLOR,
            timestamp=datetime.datetime.now(datetime.timezone.utc)
        )
        await interaction.response.send_message(embed=embed)

    @ui.button(label="Resolve Case", style=discord.ButtonStyle.success, emoji="✅", custom_id="ticket_resolve")
    async def resolve_btn(self, interaction: discord.Interaction, button: ui.Button):
        if not is_staff(interaction.user):
            await interaction.response.send_message(f"❌ **Access Denied:** Only <@&{STAFF_ROLE_ID}> can resolve tickets.", ephemeral=True)
            return
        embed = discord.Embed(
            title="✅ CASE CONCLUDED & RESOLVED",
            description=f"This case has been marked as **RESOLVED** by {interaction.user.mention}. Inquiry concluded.",
            color=SUCCESS_COLOR,
            timestamp=datetime.datetime.now(datetime.timezone.utc)
        )
        await interaction.response.send_message(embed=embed)

    @ui.button(label="Transcript", style=discord.ButtonStyle.secondary, emoji="📜", custom_id="ticket_transcript")
    async def transcript_btn(self, interaction: discord.Interaction, button: ui.Button):
        if not is_staff(interaction.user):
            await interaction.response.send_message(f"❌ **Access Denied:** Only <@&{STAFF_ROLE_ID}> can generate case transcripts.", ephemeral=True)
            return
        await interaction.response.defer(ephemeral=True)
        channel = interaction.channel
        guild = interaction.guild
        messages = [m async for m in channel.history(limit=250)]
        messages.reverse()

        lines = [
            "=" * 55,
            "VOID ROLEPLAY OFFICIAL TICKET CASE TRANSCRIPT",
            f"Channel: #{channel.name} (ID: {channel.id})",
            f"Archived By: {interaction.user.name} ({interaction.user.id})",
            f"Timestamp: {datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}",
            f"Total Messages Logged: {len(messages)}",
            "=" * 55,
            ""
        ]
        for m in messages:
            ts = m.created_at.strftime('%Y-%m-%d %H:%M:%S')
            attach_info = f" [Attachments: {', '.join(a.url for a in m.attachments)}]" if m.attachments else ""
            lines.append(f"[{ts}] {m.author.name} ({m.author.id}): {m.clean_content or '[Attachment/Embed]'}{attach_info}")
        
        full_transcript = "\n".join(lines)
        file_bytes = io.BytesIO(full_transcript.encode("utf-8"))
        discord_file = discord.File(file_bytes, filename=f"transcript-{channel.name}-{channel.id}.txt")

        log_embed = discord.Embed(
            title=f"📜 OFFICIAL CASE TRANSCRIPT — #{channel.name.upper()}",
            description=(
                f"**Ticket Channel:** #{channel.name} (`{channel.id}`)\n"
                f"**Archiving Staff:** {interaction.user.mention} (`{interaction.user.id}`)\n"
                f"**Messages Logged:** `{len(messages)}`\n"
                f"**Archive Timestamp:** <t:{int(datetime.datetime.now().timestamp())}:F>"
            ),
            color=VOID_THEME_COLOR,
            timestamp=datetime.datetime.now(datetime.timezone.utc)
        )
        log_embed.set_footer(text="VOID Roleplay Official Transcripts • High Command Archive")

        transcript_channel = guild.get_channel(TRANSCRIPTS_CHANNEL_ID)
        if not transcript_channel:
            try:
                transcript_channel = await bot.fetch_channel(TRANSCRIPTS_CHANNEL_ID)
            except Exception:
                transcript_channel = None

        if transcript_channel:
            try:
                await transcript_channel.send(embed=log_embed, file=discord_file)
                await interaction.followup.send(f"✅ **Case Transcript Archived!** Successfully logged into {transcript_channel.mention} with full `.txt` document.", ephemeral=True)
                return
            except Exception as e:
                file_bytes.seek(0)
                fallback_file = discord.File(file_bytes, filename=f"transcript-{channel.name}-{channel.id}.txt")
                await interaction.followup.send(f"⚠️ Transcript generated, but failed sending to <#{TRANSCRIPTS_CHANNEL_ID}> ({e}). File attached below:", file=fallback_file, ephemeral=True)
                return
        else:
            file_bytes.seek(0)
            fallback_file = discord.File(file_bytes, filename=f"transcript-{channel.name}-{channel.id}.txt")
            await interaction.followup.send(content=f"📜 **Transcript generated for #{channel.name}:**", file=fallback_file, ephemeral=True)
            return

    @ui.button(label="Close", style=discord.ButtonStyle.danger, emoji="🔒", custom_id="ticket_close")
    async def close_btn(self, interaction: discord.Interaction, button: ui.Button):
        if not is_staff(interaction.user):
            await interaction.response.send_message(f"❌ **Access Denied:** Only <@&{STAFF_ROLE_ID}> can close tickets.", ephemeral=True)
            return
        guild = interaction.guild
        ch = interaction.channel
        
        closed_cat = guild.get_channel(CLOSED_TICKETS_CATEGORY_ID)
        if not closed_cat:
            closed_cat = discord.utils.find(lambda c: isinstance(c, discord.CategoryChannel) and ("archive" in c.name.lower() or "closed" in c.name.lower()), guild.channels)
        
        if closed_cat:
            try:
                await ch.edit(category=closed_cat, sync_permissions=False)
            except Exception as e:
                print(f"[-] Failed to move ticket to closed category: {e}")

        embed = discord.Embed(
            title="🔒 TICKET CLOSED & ARCHIVED",
            description=f"This ticket was closed by {interaction.user.mention} and moved to <#{CLOSED_TICKETS_CATEGORY_ID}>.\nStaff can reopen this case or permanently delete this channel.",
            color=DANGER_COLOR,
            timestamp=datetime.datetime.now(datetime.timezone.utc)
        )
        await interaction.response.send_message(embed=embed, view=TicketCloseView())

class TicketCloseView(ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @ui.button(label="Reopen Ticket", style=discord.ButtonStyle.secondary, emoji="🔓", custom_id="ticket_reopen")
    async def reopen_btn(self, interaction: discord.Interaction, button: ui.Button):
        if not is_staff(interaction.user):
            await interaction.response.send_message(f"❌ **Access Denied:** Only <@&{STAFF_ROLE_ID}> can reopen tickets.", ephemeral=True)
            return
        guild = interaction.guild
        ch = interaction.channel
        
        open_cat = guild.get_channel(OPEN_TICKETS_CATEGORY_ID)
        if not open_cat:
            open_cat = discord.utils.find(lambda c: isinstance(c, discord.CategoryChannel) and "ticket" in c.name.lower(), guild.channels)
            
        if open_cat:
            try:
                await ch.edit(category=open_cat, sync_permissions=False)
            except Exception as e:
                print(f"[-] Failed to move ticket to open category: {e}")

        embed = discord.Embed(
            title="🔓 TICKET REOPENED",
            description=f"This ticket was reopened by {interaction.user.mention} and moved back to <#{OPEN_TICKETS_CATEGORY_ID}>.",
            color=SUCCESS_COLOR,
            timestamp=datetime.datetime.now(datetime.timezone.utc)
        )
        await interaction.response.send_message(embed=embed)

    @ui.button(label="Delete Channel", style=discord.ButtonStyle.danger, emoji="🗑️", custom_id="ticket_delete")
    async def delete_btn(self, interaction: discord.Interaction, button: ui.Button):
        if not is_staff(interaction.user):
            await interaction.response.send_message(f"❌ **Access Denied:** Only <@&{STAFF_ROLE_ID}> can delete ticket channels.", ephemeral=True)
            return
        await interaction.response.send_message("🗑️ Deleting ticket room in 3 seconds...", ephemeral=True)
        await asyncio.sleep(3)
        await interaction.channel.delete(reason="VOID Roleplay: Ticket Decommissioned")

class VoicePanelView(ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @ui.button(label="Lock", style=discord.ButtonStyle.secondary, emoji="🔒", custom_id="vc_panel_lock", row=0)
    async def lock_btn(self, interaction: discord.Interaction, button: ui.Button):
        member = interaction.user
        if not member.voice or not member.voice.channel:
            await interaction.response.send_message("⚠️ You must be in your patrol voice room to lock it.", ephemeral=True)
            return
        ch = member.voice.channel
        await ch.set_permissions(interaction.guild.default_role, connect=False)
        await interaction.response.send_message("🔒 **Patrol Room Locked.** Only current occupants can stay.", ephemeral=True)

    @ui.button(label="Unlock", style=discord.ButtonStyle.secondary, emoji="🔓", custom_id="vc_panel_unlock", row=0)
    async def unlock_btn(self, interaction: discord.Interaction, button: ui.Button):
        member = interaction.user
        if not member.voice or not member.voice.channel:
            await interaction.response.send_message("⚠️ You must be in your patrol voice room to unlock it.", ephemeral=True)
            return
        ch = member.voice.channel
        await ch.set_permissions(interaction.guild.default_role, connect=True)
        await interaction.response.send_message("🔓 **Patrol Room Unlocked.** All citizens may join.", ephemeral=True)

    @ui.button(label="Mute / Unmute", style=discord.ButtonStyle.secondary, emoji="🔇", custom_id="vc_panel_mute", row=0)
    async def mute_btn(self, interaction: discord.Interaction, button: ui.Button):
        await interaction.response.send_message("💡 Use `/vc mute user:@Member` or `/vc unmute user:@Member` to silence participants.", ephemeral=True)

    @ui.button(label="Disconnect / Kick", style=discord.ButtonStyle.secondary, emoji="🚫", custom_id="vc_panel_kick", row=1)
    async def kick_btn(self, interaction: discord.Interaction, button: ui.Button):
        await interaction.response.send_message("💡 Use `/vc kick user:@Member` to disconnect a member from your room.", ephemeral=True)

    @ui.button(label="Set Limit", style=discord.ButtonStyle.secondary, emoji="👥", custom_id="vc_panel_limit", row=1)
    async def limit_btn(self, interaction: discord.Interaction, button: ui.Button):
        await interaction.response.send_message("💡 Use `/vc limit amount:5` to set player capacity (2-99 slots).", ephemeral=True)

    @ui.button(label="Rename", style=discord.ButtonStyle.secondary, emoji="✏️", custom_id="vc_panel_rename", row=1)
    async def rename_btn(self, interaction: discord.Interaction, button: ui.Button):
        await interaction.response.send_message("💡 Use `/vc rename name:My Squad` to change room name.", ephemeral=True)

    @ui.button(label="Delete Patrol", style=discord.ButtonStyle.danger, emoji="❌", custom_id="vc_panel_delete", row=1)
    async def delete_btn(self, interaction: discord.Interaction, button: ui.Button):
        member = interaction.user
        if not member.voice or not member.voice.channel:
            await interaction.response.send_message("⚠️ You must be connected to your patrol voice room.", ephemeral=True)
            return
        ch = member.voice.channel
        await ch.delete(reason="VOID Roleplay: Deleted via voice panel")
        await interaction.response.send_message("❌ **Patrol Room Decommissioned.**", ephemeral=True)

# ----------------------------------------------------
# CREATE TICKET CHANNEL LOGIC
# ----------------------------------------------------
async def create_ticket_channel(interaction: discord.Interaction, prefix: str, title: str, role_ping: str, fields: dict):
    guild = interaction.guild
    member = interaction.user

    if is_blacklisted(member):
        await interaction.response.send_message("⛔ **Access Denied:** You are currently blacklisted from opening tickets in VOID Roleplay.", ephemeral=True)
        return

    # Open Tickets Category: 1452274275552723099
    category = guild.get_channel(OPEN_TICKETS_CATEGORY_ID)
    if not category:
        category = discord.utils.find(lambda c: isinstance(c, discord.CategoryChannel) and "ticket" in c.name.lower(), guild.channels)

    # Permissions
    overwrites = {
        guild.default_role: discord.PermissionOverwrite(read_messages=False),
        member: discord.PermissionOverwrite(read_messages=True, send_messages=True, attach_files=True, embed_links=True, read_message_history=True)
    }

    # Add staff role overwrites
    staff_role = guild.get_role(STAFF_ROLE_ID)
    if staff_role:
        overwrites[staff_role] = discord.PermissionOverwrite(
            read_messages=True,
            send_messages=True,
            attach_files=True,
            embed_links=True,
            read_message_history=True,
            manage_messages=True
        )

    for role in guild.roles:
        if role.id == STAFF_ROLE_ID or role.name.lower() in ["staff", "moderator", "admin", "high command"]:
            overwrites[role] = discord.PermissionOverwrite(read_messages=True, send_messages=True, attach_files=True, embed_links=True, read_message_history=True, manage_messages=True)

    safe_name = member.name.lower()[:15]
    channel_name = f"{prefix}{safe_name}"

    try:
        ch = await guild.create_text_channel(
            name=channel_name,
            category=category,
            overwrites=overwrites,
            reason=f"VOID Roleplay: Ticket opened by {member.name}"
        )

        embed = discord.Embed(
            title=f"🌌 VOID ROLEPLAY — {title.upper()}",
            description="A new official inquiry has been filed. Please remain patient while Staff reviews the details below.",
            color=VOID_THEME_COLOR,
            timestamp=datetime.datetime.now(datetime.timezone.utc)
        )
        embed.add_field(name="👤 Citizen / Submitter", value=f"{member.mention} (`{member.id}`)", inline=True)
        embed.add_field(name="⏱️ Created At", value=f"<t:{int(datetime.datetime.now().timestamp())}:F>", inline=True)
        embed.add_field(name="🔄 Case Status", value="🟡 **INITIALIZED (AWAITING STAFF)**", inline=True)

        for k, v in fields.items():
            embed.add_field(name=f"📌 {k.upper()}", value=str(v)[:1024], inline=False)

        embed.set_footer(text=f"Ticket ID: {ch.id} • High Command")

        await ch.send(
            content=f"👋 Welcome {member.mention}! An official inquiry has been opened for <@&{STAFF_ROLE_ID}>.",
            embed=embed,
            view=TicketControlsView()
        )

        await interaction.response.send_message(f"✅ **Ticket initialized!** Your case room has been created in {ch.mention}.", ephemeral=True)
    except Exception as e:
        await interaction.response.send_message(f"❌ Failed to create ticket channel: {e}", ephemeral=True)

# ----------------------------------------------------
# MAIN INTERACTION DISPATCHER (WEBSOCKET GATEWAY)
# ----------------------------------------------------
@bot.event
async def on_interaction(interaction: discord.Interaction):
    # Only process application commands here; components/modals are automatically routed to their registered Views/Modals!
    if interaction.type != discord.InteractionType.application_command:
        return

    cmd_name = interaction.data.get("name")
    member = interaction.user
    guild = interaction.guild

    # 1. /setup-tickets
    if cmd_name == "setup-tickets":
        if not is_staff(member):
            await interaction.response.send_message("❌ **Access Denied:** Only High Command and Staff can deploy the Support Station.", ephemeral=True)
            return

        options = interaction.data.get("options", [])
        target_channel = interaction.channel
        for opt in options:
            if opt.get("name") == "channel":
                ch_obj = guild.get_channel(int(opt.get("value")))
                if ch_obj:
                    target_channel = ch_obj

        embed = discord.Embed(
            title="🌌 VOID ROLEPLAY — CITIZEN SUPPORT & TICKET STATION",
            description=(
                "Welcome to the official **VOID Roleplay** Assistance & Application Terminal.\n\n"
                "Select a department from the menu below to initialize an official investigation, submit an application, or report an incident to Server Staff.\n\n"
                "**Available Support Departments:**\n"
                "• 🚨 **Player Report (RDM / VDM / FailRP)** — Report rulebreaks with video clip proof\n"
                "• ⚖️ **Ban Appeal** — Appeal an active server ban or suspension\n"
                "• 🏴 **Gang & Faction Registration** — Official syndicate & territory registry\n"
                "• 🏢 **Business & MLO Proposals** — Commercial enterprises & custom property\n"
                "• 🐛 **Bug & Glitch Reports** — Report city exploits, vehicle bugs, and script glitches\n"
                "• ❓ **General City Support** — Character questions, lost items, Tebex / CFX queries\n\n"
                "⚠️ *Trolling tickets or submitting false player reports will result in immediate Discord & City blacklist.*"
            ),
            color=VOID_THEME_COLOR,
            timestamp=datetime.datetime.now(datetime.timezone.utc)
        )
        embed.set_footer(text="VOID Roleplay High Command • 24/7 Citizen Support Terminal")

        await target_channel.send(embed=embed, view=TicketStationView())
        await interaction.response.send_message(f"✅ **VOID Roleplay Ticket Station successfully deployed to {target_channel.mention}!**", ephemeral=True)
        return

    # 2. /setup-verify
    if cmd_name == "setup-verify":
        if not is_staff(member):
            await interaction.response.send_message("❌ **Access Denied:** Only Staff can configure Verification.", ephemeral=True)
            return

        options = interaction.data.get("options", [])
        target_channel = interaction.channel
        target_role_id = None
        for opt in options:
            if opt.get("name") == "channel":
                ch_obj = guild.get_channel(int(opt.get("value")))
                if ch_obj:
                    target_channel = ch_obj
            elif opt.get("name") == "role":
                target_role_id = int(opt.get("value"))

        embed = discord.Embed(
            title="🛡️ VOID ROLEPLAY — CITIZEN VERIFICATION",
            description=(
                "Welcome to **VOID Roleplay**.\n\n"
                "To access server chat, voice patrol lounges, and whitelist applications, you must verify your identity as an authorized citizen.\n\n"
                "**Rules of Entry:**\n"
                "1. Follow all FiveM Community Standards and VOID Roleplay rules.\n"
                "2. No toxic behavior, hate speech, or out-of-character drama.\n"
                "3. Respect Staff and High Command decisions at all times.\n\n"
                "Click the button below to verify your account and receive the **Citizen** role."
            ),
            color=VOID_THEME_COLOR,
            timestamp=datetime.datetime.now(datetime.timezone.utc)
        )
        embed.set_footer(text="VOID Roleplay Gatekeeper • Anti-Bot & Raid Security")

        await target_channel.send(embed=embed, view=VerifyStationView(target_role_id))
        await interaction.response.send_message(f"✅ **VOID Roleplay Citizen Verification Station deployed to {target_channel.mention}!**", ephemeral=True)
        return

    # 3. /verify
    if cmd_name == "verify":
        role = discord.utils.find(lambda r: r.name.lower() in ["citizen", "verified"], guild.roles)
        if not role:
            await interaction.response.send_message("⚠️ Citizen role not found. Please notify Server Staff to create a `Citizen` role.", ephemeral=True)
            return
        try:
            await member.add_roles(role, reason="VOID Roleplay: Citizen Verified via /verify")
            await interaction.response.send_message(f"✅ **Verification Complete!** You have been granted the {role.mention} role. Welcome to VOID Roleplay!", ephemeral=True)
        except Exception as e:
            await interaction.response.send_message(f"❌ Verification failed: {e}", ephemeral=True)
        return

    # 4. /setup-voice-panel
    if cmd_name == "setup-voice-panel":
        if not is_staff(member):
            await interaction.response.send_message("❌ **Access Denied:** Only Staff can deploy the Voice Panel.", ephemeral=True)
            return

        options = interaction.data.get("options", [])
        target_channel = interaction.channel
        for opt in options:
            if opt.get("name") == "channel":
                ch_obj = guild.get_channel(int(opt.get("value")))
                if ch_obj:
                    target_channel = ch_obj

        embed = discord.Embed(
            title="🔊 VOID ROLEPLAY — PATROL & SQUAD VOICE CONTROLS",
            description=(
                "Welcome to the **Master Squad & Patrol Voice Manager**.\n\n"
                "When you join the **Join to Create** voice room, a dedicated squad frequency is automatically carved for you.\n"
                "Use the tactical controls below to manage your squad room:\n\n"
                "• 🔒 **Lock Room** — Restrict squad access to current members only\n"
                "• 🔓 **Unlock Room** — Open squad room to all citizens\n"
                "• 🔇 **Mute Member** — Server-mute an unwanted participant\n"
                "• 🔊 **Unmute Member** — Remove mute from a participant\n"
                "• 🚫 **Disconnect / Kick** — Eject a member from your room\n"
                "• 👥 **Set User Limit** — Set max player capacity (2-99 slots)\n"
                "• ✏️ **Rename Patrol** — Change room name (e.g. LSPD Patrol 1, Vagos)\n"
                "• ❌ **Delete Patrol** — Instantly decommission the squad channel"
            ),
            color=VOID_THEME_COLOR,
            timestamp=datetime.datetime.now(datetime.timezone.utc)
        )
        embed.set_footer(text="VOID Roleplay Voice Network • 24/7 Auto-Clean Gateway")

        await target_channel.send(embed=embed, view=VoicePanelView())
        await interaction.response.send_message(f"✅ **VOID Roleplay Voice Control Panel successfully deployed to {target_channel.mention}!**", ephemeral=True)
        return

    # 5. /city-status
    if cmd_name == "city-status":
        if not is_staff(member):
            await interaction.response.send_message("❌ **Access Denied:** Only High Command and Staff can broadcast City Status.", ephemeral=True)
            return

        options = interaction.data.get("options", [])
        status_val = "online"
        connect_ip = "cfx.re/join/voidroleplay"
        player_count = "128/128"

        for opt in options:
            if opt.get("name") == "status":
                status_val = opt.get("value")
            elif opt.get("name") == "connect_ip":
                connect_ip = opt.get("value")
            elif opt.get("name") == "player_count":
                player_count = opt.get("value")

        status_configs = {
            "online": {
                "title": "🟢 VOID ROLEPLAY — CITY SERVER IS ONLINE & LIVE",
                "desc": f"The VOID Roleplay FiveM server is **online and fully accessible**.\n\n**Direct Connect Link:**\n`{connect_ip}`\n\n**Live Population:** `{player_count}`\n**Framework:** QBCore / Custom VOID Engine\n\nPress `F8` in FiveM and type: `connect {connect_ip}`",
                "color": SUCCESS_COLOR
            },
            "restart": {
                "title": "🟡 VOID ROLEPLAY — SCHEDULED SERVER RESTART (TSUNAMI)",
                "desc": "⚠️ **Attention Citizens:** A scheduled city tsunami / restart is commencing in **5 Minutes**.\n\nWrap up current RP scenes, park your vehicles in garages, and log off safely to prevent data loss.\nThe server will reboot immediately.",
                "color": WARN_COLOR
            },
            "offline": {
                "title": "🔴 VOID ROLEPLAY — SERVER OFFLINE / SCHEDULED MAINTENANCE",
                "desc": "The VOID Roleplay server is currently **offline for scheduled maintenance & development updates**.\n\nOur team is currently pushing new city assets, scripts, and optimizations. Stand by for status updates.",
                "color": DANGER_COLOR
            },
            "queue": {
                "title": "🟠 VOID ROLEPLAY — HIGH QUEUE ALERT / PRIORITY ACTIVE",
                "desc": f"The city is currently operating at **peak capacity** with a high queue.\n\n• **Capacity:** `{player_count}`\n• **Direct Connect:** `{connect_ip}`\n• Citizens with VIP Priority queue will bypass standard citizen waiting lines.",
                "color": 0xE67E22
            }
        }

        conf = status_configs.get(status_val, status_configs["online"])
        embed = discord.Embed(title=conf["title"], description=conf["desc"], color=conf["color"], timestamp=datetime.datetime.now(datetime.timezone.utc))
        embed.set_footer(text="VOID Roleplay FiveM Network • Live Status Broadcast")

        await interaction.channel.send(embed=embed)
        await interaction.response.send_message("✅ Status broadcast dispatched.", ephemeral=True)
        return

    # 6. /automod
    if cmd_name == "automod":
        if not is_staff(member):
            await interaction.response.send_message("❌ **Access Denied:** Only Staff can configure AutoMod.", ephemeral=True)
            return
        await interaction.response.send_message("🛡️ **VOID Roleplay Auto-Mod Protection Active:** Anti-Invite, Anti-Phishing, Anti-Spam & Mass Mention Shields running.", ephemeral=True)
        return

    # 7. /vc
    if cmd_name == "vc":
        opts = interaction.data.get("options", [])
        sub = opts[0].get("name") if opts else None
        if not sub:
            await interaction.response.send_message("⚠️ Missing /vc action.", ephemeral=True)
            return

        if sub == "create":
            sub_opts = opts[0].get("options", [])
            name_val = f"{member.display_name}'s Patrol"
            limit_val = 0
            for o in sub_opts:
                if o.get("name") == "name":
                    name_val = o.get("value")
                elif o.get("name") == "limit":
                    limit_val = o.get("value", 0)

            ch = await guild.create_voice_channel(name=f"🔊 {name_val}", user_limit=limit_val, reason="VOID: /vc create")
            await interaction.response.send_message(f"✅ Patrol frequency created: {ch.mention}", ephemeral=True)
            return

        if not member.voice or not member.voice.channel:
            await interaction.response.send_message("⚠️ You must be in a voice channel to use `/vc`.", ephemeral=True)
            return

        vch = member.voice.channel
        if sub == "lock":
            await vch.set_permissions(guild.default_role, connect=False)
            await interaction.response.send_message("🔒 Room locked.", ephemeral=True)
        elif sub == "unlock":
            await vch.set_permissions(guild.default_role, connect=True)
            await interaction.response.send_message("🔓 Room unlocked.", ephemeral=True)
        elif sub == "delete":
            await vch.delete(reason="VOID: /vc delete")
            await interaction.response.send_message("❌ Room deleted.", ephemeral=True)
        else:
            await interaction.response.send_message(f"✅ `/vc {sub}` executed.", ephemeral=True)
        return

    # 8. /blacklist
    if cmd_name == "blacklist":
        if not is_staff(member):
            await interaction.response.send_message(f"❌ **Access Denied:** Only <@&{STAFF_ROLE_ID}> can manage the ticket blacklist.", ephemeral=True)
            return

        opts = interaction.data.get("options", [])
        sub = opts[0].get("name") if opts else None
        sub_opts = opts[0].get("options", []) if opts else []

        if sub == "add":
            target_user_id = None
            reason_str = "Ticket abuse / trolling / violation"
            for o in sub_opts:
                if o.get("name") == "user":
                    target_user_id = int(o.get("value"))
                elif o.get("name") == "reason":
                    reason_str = str(o.get("value"))

            if not target_user_id:
                await interaction.response.send_message("⚠️ Please specify a valid user to blacklist.", ephemeral=True)
                return

            blacklist_cache.add(target_user_id)
            save_blacklist(blacklist_cache)

            bl_role = discord.utils.find(lambda r: r.name.lower() in ["blacklisted", "ticket ban", "ticket banned"], guild.roles)
            target_member = guild.get_member(target_user_id)
            if bl_role and target_member:
                try:
                    await target_member.add_roles(bl_role, reason=f"VOID Blacklist: {reason_str}")
                except Exception:
                    pass

            embed = discord.Embed(
                title="⛔ CITIZEN BLACKLISTED FROM TICKETS",
                description=f"<@{target_user_id}> (`{target_user_id}`) has been **blacklisted** from opening support tickets.",
                color=DANGER_COLOR,
                timestamp=datetime.datetime.now(datetime.timezone.utc)
            )
            embed.add_field(name="Reason", value=reason_str, inline=False)
            embed.add_field(name="Authorized Staff", value=f"{member.mention}", inline=False)
            embed.set_footer(text="VOID Roleplay Enforcement • Ticket Shield Active")
            await interaction.response.send_message(embed=embed)
            return

        elif sub == "remove":
            target_user_id = None
            for o in sub_opts:
                if o.get("name") == "user":
                    target_user_id = int(o.get("value"))

            if not target_user_id:
                await interaction.response.send_message("⚠️ Please specify a user to unblacklist.", ephemeral=True)
                return

            blacklist_cache.discard(target_user_id)
            save_blacklist(blacklist_cache)

            bl_role = discord.utils.find(lambda r: r.name.lower() in ["blacklisted", "ticket ban", "ticket banned"], guild.roles)
            target_member = guild.get_member(target_user_id)
            if bl_role and target_member and bl_role in target_member.roles:
                try:
                    await target_member.remove_roles(bl_role, reason="VOID: Blacklist lifted")
                except Exception:
                    pass

            embed = discord.Embed(
                title="✅ CITIZEN REMOVED FROM BLACKLIST",
                description=f"<@{target_user_id}> (`{target_user_id}`) has been unblacklisted. They can now open tickets.",
                color=SUCCESS_COLOR,
                timestamp=datetime.datetime.now(datetime.timezone.utc)
            )
            embed.add_field(name="Authorized Staff", value=f"{member.mention}", inline=False)
            await interaction.response.send_message(embed=embed)
            return

        elif sub == "check":
            target_user_id = None
            for o in sub_opts:
                if o.get("name") == "user":
                    target_user_id = int(o.get("value"))

            if not target_user_id:
                await interaction.response.send_message("⚠️ Please specify a user to check.", ephemeral=True)
                return

            target_member = guild.get_member(target_user_id)
            is_bl = (target_user_id in blacklist_cache)
            if target_member and not is_bl:
                is_bl = any(r.name.lower() in ["blacklisted", "ticket ban", "ticket banned"] for r in target_member.roles)

            if is_bl:
                await interaction.response.send_message(f"⛔ **Status:** <@{target_user_id}> is **BLACKLISTED** from creating tickets.", ephemeral=True)
            else:
                await interaction.response.send_message(f"✅ **Status:** <@{target_user_id}> is **CLEAR** (Not blacklisted).", ephemeral=True)
            return

        elif sub == "list":
            if not blacklist_cache:
                await interaction.response.send_message("📋 No citizens are currently blacklisted from opening tickets.", ephemeral=True)
                return

            entries = [f"• <@{uid}> (`{uid}`)" for uid in list(blacklist_cache)[:50]]
            embed = discord.Embed(
                title="📋 VOID ROLEPLAY — BLACKLISTED CITIZENS",
                description="\n".join(entries),
                color=DANGER_COLOR,
                timestamp=datetime.datetime.now(datetime.timezone.utc)
            )
            embed.set_footer(text=f"Total Blacklisted: {len(blacklist_cache)}")
            await interaction.response.send_message(embed=embed, ephemeral=True)
            return

    # 9. /channel
    if cmd_name == "channel":
        if not is_staff(member):
            await interaction.response.send_message("❌ **Access Denied:** Only Staff can manage channels.", ephemeral=True)
            return

        opts = interaction.data.get("options", [])
        sub = opts[0].get("name") if opts else None
        sub_opts = opts[0].get("options", []) if opts else []

        if sub == "create":
            ch_name = "new-channel"
            ch_type = "text"
            for o in sub_opts:
                if o.get("name") == "name":
                    ch_name = str(o.get("value")).lower().replace(" ", "-")
                elif o.get("name") == "type":
                    ch_type = str(o.get("value"))

            if ch_type == "voice":
                new_ch = await guild.create_voice_channel(name=f"🔊 {ch_name}", reason=f"VOID: Created by {member.name}")
            else:
                new_ch = await guild.create_text_channel(name=ch_name, reason=f"VOID: Created by {member.name}")
            await interaction.response.send_message(f"✅ Channel created: {new_ch.mention}", ephemeral=True)
            return

        elif sub == "delete":
            ch = interaction.channel
            await interaction.response.send_message(f"🗑️ Deleting channel #{ch.name}...", ephemeral=True)
            await ch.delete(reason=f"VOID: Deleted by {member.name}")
            return

        elif sub == "purge":
            amount = 10
            for o in sub_opts:
                if o.get("name") == "amount":
                    amount = min(int(o.get("value")), 100)
            await interaction.response.defer(ephemeral=True)
            deleted = await interaction.channel.purge(limit=amount)
            await interaction.followup.send(f"🧹 Purged {len(deleted)} messages.", ephemeral=True)
            return

        elif sub == "lock":
            await interaction.channel.set_permissions(guild.default_role, send_messages=False)
            await interaction.response.send_message("🔒 Channel locked for citizens.", ephemeral=True)
            return

        elif sub == "unlock":
            await interaction.channel.set_permissions(guild.default_role, send_messages=True)
            await interaction.response.send_message("🔓 Channel unlocked for citizens.", ephemeral=True)
            return

    # 10. /role
    if cmd_name == "role":
        if not is_staff(member):
            await interaction.response.send_message("❌ **Access Denied:** Only Staff can manage roles.", ephemeral=True)
            return

        opts = interaction.data.get("options", [])
        sub = opts[0].get("name") if opts else None
        sub_opts = opts[0].get("options", []) if opts else []

        if sub == "create":
            r_name = "New Role"
            r_color = VOID_THEME_COLOR
            r_perm = "member"
            for o in sub_opts:
                if o.get("name") == "name":
                    r_name = str(o.get("value"))
                elif o.get("name") == "color":
                    raw_c = str(o.get("value")).replace("#", "").strip()
                    try:
                        r_color = int(raw_c, 16)
                    except Exception:
                        r_color = VOID_THEME_COLOR
                elif o.get("name") == "permissions":
                    r_perm = str(o.get("value"))

            perms = discord.Permissions.none()
            if r_perm == "admin":
                perms = discord.Permissions(administrator=True)
            elif r_perm == "mod":
                perms = discord.Permissions(manage_messages=True, kick_members=True, mute_members=True, view_channel=True, send_messages=True)
            elif r_perm == "member":
                perms = discord.Permissions(send_messages=True, view_channel=True, read_message_history=True, connect=True, speak=True)
            elif r_perm == "readonly":
                perms = discord.Permissions(view_channel=True, read_message_history=True)

            new_role = await guild.create_role(name=r_name, color=discord.Color(r_color), permissions=perms, reason=f"VOID: /role create by {member.name}")
            await interaction.response.send_message(f"✅ Role {new_role.mention} created successfully.", ephemeral=True)
            return

        elif sub == "give":
            target_uid = None
            target_rid = None
            for o in sub_opts:
                if o.get("name") == "user":
                    target_uid = int(o.get("value"))
                elif o.get("name") == "role":
                    target_rid = int(o.get("value"))

            target_m = guild.get_member(target_uid)
            target_r = guild.get_role(target_rid)
            if not target_m or not target_r:
                await interaction.response.send_message("⚠️ Invalid member or role specified.", ephemeral=True)
                return

            await target_m.add_roles(target_r, reason=f"VOID: Assigned by {member.name}")
            await interaction.response.send_message(f"✅ Assigned {target_r.mention} to {target_m.mention}.", ephemeral=True)
            return

        elif sub == "remove":
            target_uid = None
            target_rid = None
            for o in sub_opts:
                if o.get("name") == "user":
                    target_uid = int(o.get("value"))
                elif o.get("name") == "role":
                    target_rid = int(o.get("value"))

            target_m = guild.get_member(target_uid)
            target_r = guild.get_role(target_rid)
            if not target_m or not target_r:
                await interaction.response.send_message("⚠️ Invalid member or role specified.", ephemeral=True)
                return

            await target_m.remove_roles(target_r, reason=f"VOID: Removed by {member.name}")
            await interaction.response.send_message(f"✅ Removed {target_r.mention} from {target_m.mention}.", ephemeral=True)
            return

        elif sub == "delete":
            target_rid = None
            for o in sub_opts:
                if o.get("name") == "role":
                    target_rid = int(o.get("value"))

            target_r = guild.get_role(target_rid)
            if not target_r:
                await interaction.response.send_message("⚠️ Role not found.", ephemeral=True)
                return

            await target_r.delete(reason=f"VOID: Deleted by {member.name}")
            await interaction.response.send_message(f"✅ Role `{target_r.name}` deleted.", ephemeral=True)
            return

        elif sub == "list":
            roles_list = [f"• {r.mention} (`{r.id}`) - {len(r.members)} members" for r in guild.roles if r.name != "@everyone"][:25]
            embed = discord.Embed(
                title=f"🛡️ {guild.name.upper()} — SERVER ROLES",
                description="\n".join(roles_list),
                color=VOID_THEME_COLOR,
                timestamp=datetime.datetime.now(datetime.timezone.utc)
            )
            embed.set_footer(text=f"Total Roles: {len(guild.roles)}")
            await interaction.response.send_message(embed=embed, ephemeral=True)
            return

    # 11. /autorole
    if cmd_name == "autorole":
        if not is_staff(member):
            await interaction.response.send_message("❌ **Access Denied:** Only Staff can configure Auto-Role.", ephemeral=True)
            return

        opts = interaction.data.get("options", [])
        sub = opts[0].get("name") if opts else None
        sub_opts = opts[0].get("options", []) if opts else []

        if sub == "set":
            target_rid = None
            for o in sub_opts:
                if o.get("name") == "role":
                    target_rid = int(o.get("value"))

            target_r = guild.get_role(target_rid)
            if not target_r:
                await interaction.response.send_message("⚠️ Role not found.", ephemeral=True)
                return

            autorole_cache[guild.id] = target_rid
            save_autorole(autorole_cache)
            await interaction.response.send_message(f"✅ **Auto-Role Configured:** New members will automatically receive {target_r.mention}.", ephemeral=True)
            return

        elif sub == "check":
            rid = autorole_cache.get(guild.id)
            if not rid:
                await interaction.response.send_message("⚠️ No Auto-Role is currently configured for this server.", ephemeral=True)
                return
            target_r = guild.get_role(rid)
            role_display = target_r.mention if target_r else f"`{rid}` (Role deleted)"
            await interaction.response.send_message(f"ℹ️ **Current Auto-Role:** {role_display}", ephemeral=True)
            return

        elif sub == "remove":
            if guild.id in autorole_cache:
                del autorole_cache[guild.id]
                save_autorole(autorole_cache)
            await interaction.response.send_message("✅ Auto-Role disabled. New members will not receive automatic roles.", ephemeral=True)
            return

    # Default fallback
    await interaction.response.send_message(f"✅ Command `/{cmd_name}` received by VOID Roleplay engine.", ephemeral=True)

# ----------------------------------------------------
# AUTO-ROLE DISPATCHER
# ----------------------------------------------------
@bot.event
async def on_member_join(member):
    guild = member.guild
    rid = autorole_cache.get(guild.id)
    if rid:
        role = guild.get_role(rid)
        if role:
            try:
                await member.add_roles(role, reason="VOID Roleplay: Auto-Role on join")
                print(f"[+] Auto-assigned {role.name} to {member.name}")
            except Exception as e:
                print(f"[-] Failed to auto-assign role: {e}")

# ----------------------------------------------------
# 24/7 JOIN-TO-CREATE PATROL GATEWAY
# ----------------------------------------------------
@bot.event
async def on_voice_state_update(member, before, after):
    # Check if joined a trigger channel
    if after.channel:
        ch_name = after.channel.name.lower()
        if "join to create" in ch_name or "patrol setup" in ch_name or "create vc" in ch_name:
            guild = member.guild
            cat = after.channel.category
            room_name = f"🔊 {member.display_name}'s Patrol"

            overwrites = {
                guild.default_role: discord.PermissionOverwrite(connect=True, speak=True),
                member: discord.PermissionOverwrite(connect=True, speak=True, manage_channels=True, move_members=True, mute_members=True, deafen_members=True)
            }

            try:
                new_ch = await guild.create_voice_channel(name=room_name, category=cat, overwrites=overwrites, reason="VOID: Join-to-Create Patrol")
                created_rooms[new_ch.id] = member.id
                await member.move_to(new_ch, reason="VOID: Dispatched to personal patrol room")
                print(f"[+] Created patrol room {room_name} for {member.display_name}")
            except Exception as e:
                print(f"[-] Failed to provision patrol room: {e}")

    # Auto-cleanup empty squad channels
    if before.channel:
        b_name = before.channel.name.lower()
        if "join to create" not in b_name:
            is_patrol = (before.channel.id in created_rooms) or ("'s patrol" in b_name) or ("'s squad" in b_name)
            if is_patrol and len(before.channel.members) == 0:
                try:
                    await before.channel.delete(reason="VOID: Auto-cleanup empty patrol room")
                    if before.channel.id in created_rooms:
                        del created_rooms[before.channel.id]
                    print(f"[+] Auto-deleted empty room: {before.channel.name}")
                except Exception as e:
                    print(f"[-] Failed to delete room: {e}")

@bot.event
async def on_ready():
    # Register persistent views so buttons work across restarts!
    bot.add_view(TicketStationView())
    bot.add_view(VerifyStationView())
    bot.add_view(TicketControlsView())
    bot.add_view(TicketCloseView())
    bot.add_view(VoicePanelView())

    print("=" * 65)
    print(f" [OK] VOID Roleplay Master Engine Online: {bot.user} (ID: {bot.user.id})")
    print(" [OK] WebSocket Slash Command & Component Dispatcher ACTIVE")
    print(" [OK] 24/7 Join-to-Create Patrol Auto-Provisioner ACTIVE")
    print("=" * 65)
    await bot.change_presence(
        activity=discord.Activity(
            type=discord.ActivityType.watching,
            name="VOID Roleplay | /setup-tickets"
        )
    )

def main():
    token = get_token()
    if not token or token.startswith("PASTE_"):
        print("[-] Error: No valid Discord Bot Token found!")
        sys.exit(1)
    bot.run(token)

if __name__ == "__main__":
    main()
