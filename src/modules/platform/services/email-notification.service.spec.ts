import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import * as nodemailer from 'nodemailer';
import { EmailNotificationService, SecurityEventEmail } from './email-notification.service';

jest.mock('nodemailer');

describe('EmailNotificationService', () => {
  let service: EmailNotificationService;
  let mockSendMail: jest.Mock;

  beforeEach(async () => {
    mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-123' });

    const mockTransporter = {
      sendMail: mockSendMail,
    };

    (nodemailer.createTransport as jest.Mock).mockReturnValue(mockTransporter);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailNotificationService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: any) => {
              const config: Record<string, any> = {
                SMTP_HOST: 'smtp.example.com',
                SMTP_PORT: 587,
                SMTP_USER: 'admin@example.com',
                SMTP_PASSWORD: 'password123',
                SMTP_FROM: 'security@platform.com',
              };
              return config[key] ?? fallback;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<EmailNotificationService>(EmailNotificationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sendSecurityEvent', () => {
    it('should send security event email', async () => {
      const event: SecurityEventEmail = {
        to: 'admin@example.com',
        userId: 'user-123',
        userEmail: 'admin@example.com',
        eventType: 'mfa_enabled',
        ipAddress: '192.168.1.1',
      };

      await service.sendSecurityEvent(event);

      expect(mockSendMail).toHaveBeenCalledWith({
        from: 'security@platform.com',
        to: 'admin@example.com',
        subject: expect.stringContaining('Multi-Factor Authentication Enabled'),
        html: expect.stringContaining('MFA'),
      });
    });

    it('should include ip address in email', async () => {
      const event: SecurityEventEmail = {
        to: 'admin@example.com',
        userId: 'user-123',
        userEmail: 'admin@example.com',
        eventType: 'login_from_new_device',
        ipAddress: '10.0.0.1',
      };

      await service.sendSecurityEvent(event);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('10.0.0.1'),
        }),
      );
    });

    it('should include user agent in email when provided', async () => {
      const event: SecurityEventEmail = {
        to: 'admin@example.com',
        userId: 'user-123',
        userEmail: 'admin@example.com',
        eventType: 'login_from_new_device',
        ipAddress: '10.0.0.1',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      };

      await service.sendSecurityEvent(event);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('Mozilla/5.0'),
        }),
      );
    });

    it('should skip email if transporter not initialized', async () => {
      // Create service with missing SMTP config
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EmailNotificationService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string, fallback?: any) => fallback),
            },
          },
        ],
      }).compile();

      const serviceNoTransporter = module.get<EmailNotificationService>(EmailNotificationService);

      const event: SecurityEventEmail = {
        to: 'admin@example.com',
        userId: 'user-123',
        userEmail: 'admin@example.com',
        eventType: 'mfa_enabled',
        ipAddress: '192.168.1.1',
      };

      mockSendMail.mockClear();
      await serviceNoTransporter.sendSecurityEvent(event);

      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('should handle email sending errors gracefully', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('SMTP connection failed'));

      const event: SecurityEventEmail = {
        to: 'admin@example.com',
        userId: 'user-123',
        userEmail: 'admin@example.com',
        eventType: 'mfa_enabled',
        ipAddress: '192.168.1.1',
      };

      // Should not throw
      await expect(service.sendSecurityEvent(event)).resolves.toBeUndefined();
    });
  });

  describe('notifyPasswordReset', () => {
    it('should send password reset notification', async () => {
      await service.notifyPasswordReset('admin@example.com', 'super-admin', 'Security policy update');

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('Password Reset'),
          html: expect.stringContaining('password has been reset'),
        }),
      );
    });

    it('should include reset by and reason in email', async () => {
      await service.notifyPasswordReset('admin@example.com', 'security-admin', 'Account compromise suspected');

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('security-admin'),
        }),
      );
    });
  });

  describe('notifyAccountLocked', () => {
    it('should send account locked notification', async () => {
      const lockedUntil = new Date(Date.now() + 30 * 60 * 1000);

      await service.notifyAccountLocked('admin@example.com', lockedUntil, 5);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('Account Locked'),
          html: expect.stringContaining('multiple failed login attempts'),
        }),
      );
    });

    it('should include attempt count in email', async () => {
      const lockedUntil = new Date();

      await service.notifyAccountLocked('admin@example.com', lockedUntil, 10);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('10'),
        }),
      );
    });
  });

  describe('notifySessionRevoked', () => {
    it('should send session revoked notification', async () => {
      await service.notifySessionRevoked('admin@example.com', 'Suspicious activity detected', 'security-admin');

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('Session Revoked'),
          html: expect.stringContaining('session has been revoked'),
        }),
      );
    });

    it('should include revoked by in email', async () => {
      await service.notifySessionRevoked('admin@example.com', 'User requested', 'super-admin');

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('super-admin'),
        }),
      );
    });
  });

  describe('notifyMFAEnabled', () => {
    it('should send MFA enabled notification', async () => {
      await service.notifyMFAEnabled('admin@example.com');

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('Authentication Enabled'),
          html: expect.stringContaining('MFA'),
        }),
      );
    });
  });

  describe('notifyNewDeviceLogin', () => {
    it('should send new device login notification', async () => {
      await service.notifyNewDeviceLogin('admin@example.com', '192.168.1.100', 'Mozilla/5.0', 'MacBook Pro');

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('New Device Login'),
          html: expect.stringContaining('new device'),
        }),
      );
    });

    it('should include device name in email', async () => {
      await service.notifyNewDeviceLogin('admin@example.com', '192.168.1.100', 'Mozilla/5.0', 'iPhone 13');

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('iPhone 13'),
        }),
      );
    });
  });

  describe('notifyDataExport', () => {
    it('should send data export notification', async () => {
      await service.notifyDataExport('admin@example.com', 'full_export', 'compliance-admin');

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('Data Export'),
          html: expect.stringContaining('export'),
        }),
      );
    });

    it('should include export type and requester', async () => {
      await service.notifyDataExport('admin@example.com', 'audit_logs', 'security-admin');

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('audit_logs'),
        }),
      );
    });
  });

  describe('Email content validation', () => {
    it('should generate valid HTML for all event types', async () => {
      const eventTypes: SecurityEventEmail['eventType'][] = [
        'password_reset',
        'account_locked',
        'session_revoked',
        'mfa_enabled',
        'mfa_disabled',
        'login_from_new_device',
        'ip_allowlist_updated',
        'data_export_requested',
        'data_deletion_scheduled',
      ];

      for (const eventType of eventTypes) {
        mockSendMail.mockClear();

        const event: SecurityEventEmail = {
          to: 'test@example.com',
          userId: 'user-123',
          userEmail: 'test@example.com',
          eventType,
          ipAddress: '192.168.1.1',
        };

        await service.sendSecurityEvent(event);

        expect(mockSendMail).toHaveBeenCalled();
        const call = mockSendMail.mock.calls[0][0];
        expect(call.html).toContain('<!DOCTYPE html>');
        expect(call.html).toContain('</html>');
        expect(call.subject).toBeTruthy();
      }
    });
  });
});
