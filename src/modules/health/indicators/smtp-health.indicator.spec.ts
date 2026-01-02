import { ConfigService } from '@nestjs/config';
import { HealthCheckError } from '@nestjs/terminus';
import { Test, TestingModule } from '@nestjs/testing';
import * as net from 'net';
import { SmtpHealthIndicator } from './smtp-health.indicator';

jest.mock('net');

describe('SmtpHealthIndicator', () => {
  let indicator: SmtpHealthIndicator;

  const mockConfig = {
    SMTP_HOST: 'localhost',
    SMTP_PORT: 587,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmtpHealthIndicator,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key) => mockConfig[key as keyof typeof mockConfig]),
          },
        },
      ],
    }).compile();

    indicator = module.get<SmtpHealthIndicator>(SmtpHealthIndicator);
  });

  it('should be defined', () => {
    expect(indicator).toBeDefined();
  });

  describe('isHealthy', () => {
    it('should return up status if SMTP is responsive', async () => {
      const mockSocket: any = {
        setTimeout: jest.fn(),
        connect: jest.fn(),
        destroy: jest.fn(),
        removeAllListeners: jest.fn(),
      };
      mockSocket.once = jest.fn((event, cb) => {
        if (event === 'connect') setTimeout(() => cb(), 10);
        return mockSocket;
      });
      (net.Socket as unknown as jest.Mock).mockReturnValue(mockSocket);

      const result = await indicator.isHealthy('smtp');

      expect(result).toEqual({
        smtp: { status: 'up', host: 'localhost', port: 587 },
      });
    });

    it('should throw HealthCheckError if SMTP connection fails', async () => {
      const mockSocket: any = {
        setTimeout: jest.fn(),
        connect: jest.fn(),
        destroy: jest.fn(),
        removeAllListeners: jest.fn(),
      };
      mockSocket.once = jest.fn((event, cb) => {
        if (event === 'error')
          setTimeout(() => cb(new Error('Connection refused')), 10);
        return mockSocket;
      });
      (net.Socket as unknown as jest.Mock).mockReturnValue(mockSocket);

      await expect(indicator.isHealthy('smtp')).rejects.toThrow(
        HealthCheckError,
      );
    });

    it('should throw HealthCheckError if SMTP connection timeouts', async () => {
      const mockSocket: any = {
        setTimeout: jest.fn(),
        connect: jest.fn(),
        destroy: jest.fn(),
        removeAllListeners: jest.fn(),
      };
      mockSocket.once = jest.fn((event, cb) => {
        if (event === 'timeout') setTimeout(() => cb(), 10);
        return mockSocket;
      });
      (net.Socket as unknown as jest.Mock).mockReturnValue(mockSocket);

      await expect(indicator.isHealthy('smtp')).rejects.toThrow(
        HealthCheckError,
      );
    });
  });

  describe('configuration fallbacks', () => {
    it('should use default values', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SmtpHealthIndicator,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue(undefined),
            },
          },
        ],
      }).compile();
      const instance = module.get<SmtpHealthIndicator>(SmtpHealthIndicator);
      expect(instance).toBeDefined();
    });
  });
});
