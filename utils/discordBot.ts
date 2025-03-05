// utils/discordBot.ts
import { Client, GatewayIntentBits, ChannelType, TextChannel } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID; // Your server ID
const DISCORD_CATEGORY_ID = process.env.DISCORD_CATEGORY_ID; // Category for project channels

if (!DISCORD_BOT_TOKEN || !DISCORD_GUILD_ID) {
  console.error('Discord bot configuration missing. Check your environment variables.');
}

// Create a new client instance
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
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

    // Create a text channel
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: DISCORD_CATEGORY_ID, // Optional: Place in a category
      topic: `Collaboration channel for project: ${projectTitle} (ID: ${projectId})`,
    });

    // Create an invite link that doesn't expire
    const invite = await (channel as TextChannel).createInvite({
      maxAge: 0, // 0 = never expires
      maxUses: 0, // 0 = unlimited uses
      unique: true,
      reason: `Project collaboration channel for ${projectTitle}`
    });

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

    const invite = await channel.createInvite({
      maxAge: 0,
      maxUses: 0,
      unique: true,
      reason: `Refreshed invite for project: ${projectTitle}`
    });

    return `https://discord.gg/${invite.code}`;
  } catch (error) {
    console.error('Error refreshing invite link:', error);
    return null;
  }
};

export default client;