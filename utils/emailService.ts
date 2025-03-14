// utils/emailService.ts
import nodemailer from 'nodemailer';
import path from 'path';
import fs from 'fs';
import ejs from 'ejs';
import User from '../models/userModel';
import dotenv from 'dotenv';

dotenv.config();

// Email configuration
const emailConfig = {
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
  from: process.env.EMAIL_FROM || 'noreply@projectrix.io',
};

// Create a reusable transporter object
const transporter = nodemailer.createTransport({
  host: emailConfig.host,
  port: emailConfig.port,
  secure: emailConfig.secure,
  auth: emailConfig.auth,
});

/**
 * Send an email using a template
 * @param to Recipient email address
 * @param subject Email subject
 * @param templateName Name of the template file (without extension)
 * @param data Template data object
 */
export const sendEmailTemplate = async (
  to: string,
  subject: string,
  templateName: string,
  data: any = {}
): Promise<boolean> => {
  try {
    // Template path
    const templatePath = path.join(__dirname, '../templates/emails', `${templateName}.ejs`);
    
    // Read template file
    const template = fs.readFileSync(templatePath, 'utf-8');
    
    // Render template with data
    const html = ejs.render(template, { ...data, year: new Date().getFullYear() });
    
    // Send email
    const result = await transporter.sendMail({
      from: `"Projectrix" <${emailConfig.from}>`,
      to,
      subject,
      html,
    });
    
    console.log(`Email sent to ${to}. MessageId: ${result.messageId}`);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
};

/**
 * Send a welcome email to a newly registered user
 * @param user User object containing name and email
 */
export const sendWelcomeEmail = async (user: any): Promise<boolean> => {
  const { name, email } = user;
  
  return sendEmailTemplate(
    email,
    'Welcome to Projectrix!',
    'welcome',
    {
      name,
      userName: name,
      userEmail: email,
    }
  );
};

/**
 * Send a newsletter to all subscribed users
 * @param subject Newsletter subject
 * @param templateName Template name to use
 * @param data Template data
 */
export const sendNewsletter = async (
  subject: string,
  templateName: string,
  data: any = {}
): Promise<{ success: boolean; sentCount: number; failedCount: number }> => {
  try {
    // Find all users who are subscribed to the newsletter
    const users = await User.find({ newsletterSubscribed: true });
    
    console.log(`Sending newsletter to ${users.length} users`);
    
    let sentCount = 0;
    let failedCount = 0;
    
    // Send emails in batches to avoid overwhelming the email server
    const batchSize = 50;
    
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      
      // Send emails in parallel for the current batch
      const results = await Promise.all(
        batch.map(async (user) => {
          try {
            const result = await sendEmailTemplate(
              user.email,
              subject,
              templateName,
              {
                ...data,
                name: user.name,
                userName: user.name,
                userEmail: user.email,
              }
            );
            
            return result;
          } catch (error) {
            console.error(`Failed to send newsletter to ${user.email}:`, error);
            return false;
          }
        })
      );
      
      // Count successes and failures
      results.forEach((result) => {
        if (result) {
          sentCount++;
        } else {
          failedCount++;
        }
      });
      
      // Add a small delay between batches to avoid rate limiting
      if (i + batchSize < users.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    
    return {
      success: failedCount === 0,
      sentCount,
      failedCount,
    };
  } catch (error) {
    console.error('Error sending newsletter:', error);
    return {
      success: false,
      sentCount: 0,
      failedCount: 0,
    };
  }
};

// Verify email configuration on startup
export const verifyEmailConfig = async (): Promise<boolean> => {
  try {
    if (!emailConfig.auth.user || !emailConfig.auth.pass) {
      console.warn('Email configuration incomplete. Email sending will be disabled.');
      return false;
    }
    
    await transporter.verify();
    console.log('Email service is ready to send messages');
    return true;
  } catch (error) {
    console.error('Error verifying email configuration:', error);
    return false;
  }
};

export default {
  sendEmailTemplate,
  sendWelcomeEmail,
  sendNewsletter,
  verifyEmailConfig,
};