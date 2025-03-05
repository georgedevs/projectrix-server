// utils/discordBot.ts
import { Client, GatewayIntentBits, ChannelType, TextChannel, PermissionFlagsBits, OverwriteType } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID; // Your server ID
const DISCORD_CATEGORY_ID = process.env.DISCORD_CATEGORY_ID; // Category for project channels
const DISCORD_ADMIN_ROLE_ID = process.env.DISCORD_ADMIN_ROLE_ID; // Admin role ID

if (!DISCORD_BOT_TOKEN || !DISCORD_GUILD_ID) {
  console.error('Discord bot configuration missing. Check your environment variables.');
}

// Create a new client instance
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildInvites,
  ]
});

// Initialize Discord client
let isReady = false;
client.once('ready', () => {
  console.log('Discord bot is ready!');
  isReady = true;
});

// Login to Discord
if (DISCORD_BOT_TOKEN) {
  client.login(DISCORD_BOT_TOKEN).catch(err => {
    console.error('Discord bot login failed:', err);
  });
}

// Create a new Discord channel for a project
export const createProjectChannel = async (projectId: string, projectTitle: string): Promise<{ channelId: string, inviteLink: string } | null> => {
  try {
    if (!isReady) {
      console.log('Discord bot is not ready yet. Waiting...');
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for bot to connect
      if (!isReady) {
        throw new Error('Discord bot is not connected');
      }
    }

    // Get the guild
    const guild = client.guilds.cache.get(DISCORD_GUILD_ID);
    if (!guild) {
      throw new Error('Guild not found');
    }

    // Sanitize project title for channel name (Discord channel names must be lowercase, no spaces)
    const channelName = `project-${projectId.substring(0, 8)}-${projectTitle.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 20)}`;

    // Check if channel already exists
    const existingChannel = guild.channels.cache.find(ch => 
      ch.name === channelName && ch.type === ChannelType.GuildText
    ) as TextChannel;

    let channel;
    if (existingChannel) {
      console.log(`Channel ${channelName} already exists, using existing channel`);
      channel = existingChannel;
    } else {
      // Create channel with simplified permission structure
      channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: DISCORD_CATEGORY_ID, // Optional: Place in a category
        topic: `Collaboration channel for project: ${projectTitle} (ID: ${projectId})`,
        // Set initial permissions - SIMPLIFIED VERSION
        permissionOverwrites: [
          // By default, @everyone can't see the channel
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel],
            type: OverwriteType.Role
          },
          // Bot needs all permissions to manage the channel
          {
            id: client.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.ManageMessages,
              PermissionFlagsBits.CreateInstantInvite
            ],
            type: OverwriteType.Member
          }
        ]
      });
      
      // Send welcome message
      await channel.send({
        content: `# Welcome to the ${projectTitle} Project Channel!

This is a private channel for collaborators on the ${projectTitle} project. 

**Important Information:**
- This channel is private and only visible to invited project members
- All team members can send messages and read history in this channel
- Please be respectful and follow project communication guidelines

Happy collaborating! 🚀`
      });
      
      console.log(`Created new private channel: ${channel.name}`);
    }

    // Delete existing invites for this channel to avoid clutter
    const existingInvites = await channel.fetchInvites();
    await Promise.all(existingInvites.map(invite => invite.delete('Creating fresh permanent invite')));

    // Create an invite link that doesn't expire, has unlimited uses, and GRANTS the right permissions
    const invite = await channel.createInvite({
      maxAge: 0, // 0 = never expires
      maxUses: 0, // 0 = unlimited uses
      unique: true,
      temporary: false, // IMPORTANT: This must be false so permissions remain after disconnect
      reason: `Project collaboration channel for ${projectTitle}`
    });

    console.log(`Created invite link: https://discord.gg/${invite.code}`);

    // Return channel ID and invite link
    return {
      channelId: channel.id,
      inviteLink: `https://discord.gg/${invite.code}`
    };
  } catch (error) {
    console.error('Error creating Discord channel:', error);
    return null;
  }
};

// Get a new invite link for an existing channel
export const refreshInviteLink = async (channelId: string, projectTitle: string): Promise<string | null> => {
  try {
    if (!isReady) {
      throw new Error('Discord bot is not connected');
    }

    const guild = client.guilds.cache.get(DISCORD_GUILD_ID);
    if (!guild) {
      throw new Error('Guild not found');
    }

    const channel = guild.channels.cache.get(channelId) as TextChannel;
    if (!channel) {
      throw new Error('Channel not found');
    }

    // Delete existing invites for this channel
    const existingInvites = await channel.fetchInvites();
    await Promise.all(existingInvites.map(invite => invite.delete('Creating fresh permanent invite')));

    // Create a new invite that doesn't expire
    // Remove problematic targetType parameter
    const invite = await channel.createInvite({
      maxAge: 0, // 0 = never expires
      maxUses: 0, // 0 = unlimited uses
      unique: true,
      temporary: false, // Don't kick after disconnect
      reason: `Refreshed invite for project: ${projectTitle}`
    });

    console.log(`Refreshed invite link: https://discord.gg/${invite.code}`);
    return `https://discord.gg/${invite.code}`;
  } catch (error) {
    console.error('Error refreshing invite link:', error);
    return null;
  }
};

export default client;