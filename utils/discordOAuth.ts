// utils/discordOAuth.ts
import axios from 'axios';
import { TextChannel } from 'discord.js';
import User from '../models/userModel';
import client  from './discordBot'; 

// Discord OAuth2 configuration
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;

/**
 * Add a user to a Discord channel using their Discord ID
 */
export const addUserToChannel = async (
  discordUserId: string, 
  channelId: string
): Promise<boolean> => {
  try {
    console.log(`Adding Discord user ${discordUserId} to channel ${channelId}`);
    
    // Fetch the channel
    const channel = await client.channels.fetch(channelId) as TextChannel;
    if (!channel) {
      console.error(`Channel not found: ${channelId}`);
      return false;
    }
    
    const guild = channel.guild;
    
    // Check if user is in the guild
    let member;
    try {
      member = await guild.members.fetch(discordUserId);
    } catch (error) {
      console.log(`User ${discordUserId} is not in the guild, inviting them...`);
      
      // Create an invite to the guild if the user isn't a member
      const invite = await guild.invites.create(channel, {
        maxUses: 1,
        unique: true,
        reason: `Inviting user ${discordUserId} to join for channel access`
      });
      
      console.log(`Created guild invite: ${invite.url}`);
      return false; // We need the user to join the guild first
    }
    
    // Add permission overwrite for this user
    await channel.permissionOverwrites.create(member, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true
    });
    
    console.log(`Successfully added user ${discordUserId} to channel ${channelId}`);
    return true;
  } catch (error) {
    console.error('Error adding user to channel:', error);
    return false;
  }
};

/**
 * Link a user's platform account with their Discord account
 */
export const linkDiscordAccount = async (
  userId: string, 
  discordCode: string
): Promise<{ discordId: string; username: string; inviteUrl?: string } | null> => {
  try {
    console.log(`Linking Discord account for user ${userId} with code ${discordCode.substring(0, 10)}...`);
    
    // Exchange the authorization code for an access token
    const tokenResponse = await axios.post(
      'https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id: DISCORD_CLIENT_ID!,
        client_secret: DISCORD_CLIENT_SECRET!,
        grant_type: 'authorization_code',
        code: discordCode,
        redirect_uri: DISCORD_REDIRECT_URI!
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    const { access_token } = tokenResponse.data;
    
    // Get the user's Discord information
    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${access_token}`
      }
    });
    
    const { id: discordId, username } = userResponse.data;
    console.log(`Got Discord user info: ${username} (${discordId})`);
    
    // Update your user model to store the Discord ID
    await User.findByIdAndUpdate(userId, { 
      discordId,
      discordUsername: username
    });
    
    console.log(`Successfully linked Discord account for user ${userId}`);
    return { discordId, username };
  } catch (error) {
    console.error('Error linking Discord account:', error);
    return null;
  }
};

/**
 * Get an invite URL for the Discord OAuth flow
 */
export const getDiscordAuthUrl = (projectId: string, state: string): string => {
  const url = new URL('https://discord.com/api/oauth2/authorize');
  url.searchParams.append('client_id', DISCORD_CLIENT_ID!);
  url.searchParams.append('redirect_uri', DISCORD_REDIRECT_URI!);
  url.searchParams.append('response_type', 'code');
  url.searchParams.append('scope', 'identify');
  url.searchParams.append('state', state); // State includes projectId and other info
  
  return url.toString();
};