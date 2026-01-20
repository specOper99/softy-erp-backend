import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

export interface SecurityEventEmail {
  to: string;
  userId: string;
  userEmail: string;
  eventType:
    | 'password_reset'
    | 'account_locked'
    | 'session_revoked'
    | 'mfa_enabled'
    | 'mfa_disabled'
    | 'login_from_new_device'
    | 'ip_allowlist_updated'
    | 'data_export_requested'
    | 'data_deletion_scheduled';
  ipAddress: string;
  userAgent?: string;
  additionalData?: Record<string, unknown>;
}

/**
 * Service for sending security event notifications via email
 */
@Injectable()
export class EmailNotificationService {
  private readonly logger = new Logger(EmailNotificationService.name);
  private transporter: Transporter;

  constructor(private readonly configService: ConfigService) {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    const smtpHost = this.configService.get<string>('SMTP_HOST');
    const smtpPort = this.configService.get<number>('SMTP_PORT', 587);
    const smtpUser = this.configService.get<string>('SMTP_USER');
    const smtpPassword = this.configService.get<string>('SMTP_PASSWORD');

    if (!smtpHost || !smtpUser || !smtpPassword) {
      this.logger.warn('SMTP configuration not complete - email notifications disabled');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPassword,
      },
    });

    this.logger.log('Email transporter initialized successfully');
  }

  /**
   * Send security event notification
   */
  async sendSecurityEvent(event: SecurityEventEmail): Promise<void> {
    if (!this.transporter) {
      this.logger.warn('Email transporter not initialized - skipping notification');
      return;
    }

    try {
      const subject = this.getSubject(event.eventType);
      const html = this.generateEmailHTML(event);

      await this.transporter.sendMail({
        from: this.configService.get<string>('SMTP_FROM', 'security@platform.com'),
        to: event.to,
        subject,
        html,
      });

      this.logger.log(`Security event email sent: ${event.eventType} to ${event.to}`);
    } catch (error) {
      this.logger.error(
        `Failed to send security event email: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Don't throw - email failures shouldn't block security operations
    }
  }

  /**
   * Send password reset notification
   */
  async notifyPasswordReset(userEmail: string, resetBy: string, reason: string): Promise<void> {
    await this.sendSecurityEvent({
      to: userEmail,
      userId: '',
      userEmail,
      eventType: 'password_reset',
      ipAddress: '',
      additionalData: { resetBy, reason },
    });
  }

  /**
   * Send account locked notification
   */
  async notifyAccountLocked(userEmail: string, lockedUntil: Date, attempts: number): Promise<void> {
    await this.sendSecurityEvent({
      to: userEmail,
      userId: '',
      userEmail,
      eventType: 'account_locked',
      ipAddress: '',
      additionalData: { lockedUntil, attempts },
    });
  }

  /**
   * Send session revoked notification
   */
  async notifySessionRevoked(userEmail: string, reason: string, revokedBy: string): Promise<void> {
    await this.sendSecurityEvent({
      to: userEmail,
      userId: '',
      userEmail,
      eventType: 'session_revoked',
      ipAddress: '',
      additionalData: { reason, revokedBy },
    });
  }

  /**
   * Send MFA enabled notification
   */
  async notifyMFAEnabled(userEmail: string): Promise<void> {
    await this.sendSecurityEvent({
      to: userEmail,
      userId: '',
      userEmail,
      eventType: 'mfa_enabled',
      ipAddress: '',
    });
  }

  /**
   * Send new device login notification
   */
  async notifyNewDeviceLogin(
    userEmail: string,
    ipAddress: string,
    userAgent: string,
    deviceName?: string,
  ): Promise<void> {
    await this.sendSecurityEvent({
      to: userEmail,
      userId: '',
      userEmail,
      eventType: 'login_from_new_device',
      ipAddress,
      userAgent,
      additionalData: { deviceName },
    });
  }

  /**
   * Send data export notification
   */
  async notifyDataExport(userEmail: string, exportType: string, requestedBy: string): Promise<void> {
    await this.sendSecurityEvent({
      to: userEmail,
      userId: '',
      userEmail,
      eventType: 'data_export_requested',
      ipAddress: '',
      additionalData: { exportType, requestedBy },
    });
  }

  private getSubject(eventType: SecurityEventEmail['eventType']): string {
    const subjects = {
      password_reset: '🔒 Password Reset Notification',
      account_locked: '⚠️ Account Locked - Security Alert',
      session_revoked: '🚪 Session Revoked',
      mfa_enabled: '✅ Multi-Factor Authentication Enabled',
      mfa_disabled: '⚠️ Multi-Factor Authentication Disabled',
      login_from_new_device: '📱 New Device Login Detected',
      ip_allowlist_updated: '🌐 IP Allowlist Updated',
      data_export_requested: '📦 Data Export Requested',
      data_deletion_scheduled: '🗑️ Data Deletion Scheduled',
    };

    return `[Platform Security] ${subjects[eventType]}`;
  }

  private generateEmailHTML(event: SecurityEventEmail): string {
    const timestamp = new Date().toISOString();

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #1a1a1a; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
    .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
    .alert { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 15px 0; }
    .critical { background: #f8d7da; border-left: 4px solid #dc3545; }
    .info { background: #d1ecf1; border-left: 4px solid #0c5460; }
    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
    .detail { margin: 10px 0; }
    .detail strong { display: inline-block; width: 150px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>🔒 Platform Security Notification</h2>
    </div>
    <div class="content">
      ${this.getEventContent(event)}
      
      <div class="detail">
        <strong>Event Time:</strong> ${timestamp}
      </div>
      ${event.ipAddress ? `<div class="detail"><strong>IP Address:</strong> ${event.ipAddress}</div>` : ''}
      ${event.userAgent ? `<div class="detail"><strong>User Agent:</strong> ${event.userAgent}</div>` : ''}
      
      <div class="alert ${this.getAlertClass(event.eventType)}">
        <strong>⚠️ If you did not perform this action, please contact your administrator immediately.</strong>
      </div>
    </div>
    <div class="footer">
      <p>This is an automated security notification from the Platform Admin Console.</p>
      <p>Do not reply to this email.</p>
    </div>
  </div>
</body>
</html>
    `;
  }

  private getEventContent(event: SecurityEventEmail): string {
    const data = event.additionalData ?? {};
    const getString = (val: unknown, fallback: string): string => {
      if (val === null || val === undefined) return fallback;
      if (typeof val === 'string') return val;
      if (typeof val === 'number' || typeof val === 'boolean') return String(val);
      if (val instanceof Date) return val.toISOString();
      return fallback;
    };

    const contents = {
      password_reset: `
        <h3>Password Reset</h3>
        <p>Your password has been reset by a platform administrator.</p>
        <div class="detail"><strong>Reset By:</strong> ${getString(data.resetBy, 'Unknown')}</div>
        <div class="detail"><strong>Reason:</strong> ${getString(data.reason, 'No reason provided')}</div>
        <p><strong>You will need to set a new password on your next login.</strong></p>
      `,
      account_locked: `
        <h3>Account Locked</h3>
        <p>Your account has been locked due to multiple failed login attempts.</p>
        <div class="detail"><strong>Failed Attempts:</strong> ${getString(data.attempts, 'Unknown')}</div>
        <div class="detail"><strong>Locked Until:</strong> ${getString(data.lockedUntil, 'Unknown')}</div>
      `,
      session_revoked: `
        <h3>Session Revoked</h3>
        <p>Your active session has been revoked.</p>
        <div class="detail"><strong>Revoked By:</strong> ${getString(data.revokedBy, 'Unknown')}</div>
        <div class="detail"><strong>Reason:</strong> ${getString(data.reason, 'No reason provided')}</div>
        <p>You will need to log in again to continue.</p>
      `,
      mfa_enabled: `
        <h3>Multi-Factor Authentication Enabled</h3>
        <p>MFA has been successfully enabled on your account.</p>
        <p>You will need to provide an MFA code on your next login.</p>
      `,
      mfa_disabled: `
        <h3>Multi-Factor Authentication Disabled</h3>
        <p>MFA has been disabled on your account.</p>
        <p><strong>⚠️ This reduces your account security. Consider re-enabling MFA.</strong></p>
      `,
      login_from_new_device: `
        <h3>New Device Login</h3>
        <p>A login from a new device was detected on your account.</p>
        <div class="detail"><strong>Device:</strong> ${getString(data.deviceName, 'Unknown')}</div>
      `,
      ip_allowlist_updated: `
        <h3>IP Allowlist Updated</h3>
        <p>The IP allowlist for your account has been updated by a platform administrator.</p>
      `,
      data_export_requested: `
        <h3>Data Export Requested</h3>
        <p>A data export has been requested for your account.</p>
        <div class="detail"><strong>Export Type:</strong> ${getString(data.exportType, 'Unknown')}</div>
        <div class="detail"><strong>Requested By:</strong> ${getString(data.requestedBy, 'Unknown')}</div>
      `,
      data_deletion_scheduled: `
        <h3>Data Deletion Scheduled</h3>
        <p>Your account data has been scheduled for deletion.</p>
        <p><strong>This action cannot be undone.</strong></p>
      `,
    };

    return contents[event.eventType] || '<p>Security event occurred</p>';
  }

  private getAlertClass(eventType: SecurityEventEmail['eventType']): string {
    const criticalEvents = ['account_locked', 'session_revoked', 'data_deletion_scheduled'];
    return criticalEvents.includes(eventType) ? 'critical' : 'info';
  }
}
