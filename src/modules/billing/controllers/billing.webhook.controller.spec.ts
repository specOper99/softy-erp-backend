import { BadRequestException, Logger, RawBodyRequest } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';
import Stripe from 'stripe';
import { StripeService } from '../services/stripe.service';
import { SubscriptionService } from '../services/subscription.service';
import { BillingWebhookController } from './billing.controller';

describe('BillingWebhookController', () => {
  let controller: BillingWebhookController;
  let subscriptionService: jest.Mocked<SubscriptionService>;
  let stripeService: jest.Mocked<StripeService>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BillingWebhookController],
      providers: [
        {
          provide: SubscriptionService,
          useValue: {
            handleWebhookEvent: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: StripeService,
          useValue: {
            constructWebhookEvent: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(BillingWebhookController);
    subscriptionService = module.get(SubscriptionService);
    stripeService = module.get(StripeService);
    configService = module.get(ConfigService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('handleStripeWebhook', () => {
    it('should throw if STRIPE_WEBHOOK_SECRET is missing', async () => {
      configService.get.mockReturnValue(undefined);

      await expect(
        controller.handleStripeWebhook(
          { rawBody: Buffer.from('{}') } as unknown as RawBodyRequest<Request> & { rawBody?: Buffer },
          'sig',
        ),
      ).rejects.toThrow('billing.stripe_config_error');
    });

    it('should throw BadRequestException if rawBody is missing', async () => {
      configService.get.mockReturnValue('whsec_test');

      await expect(
        controller.handleStripeWebhook({} as unknown as RawBodyRequest<Request> & { rawBody?: Buffer }, 'sig'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if stripe-signature header is missing', async () => {
      configService.get.mockReturnValue('whsec_test');

      await expect(
        controller.handleStripeWebhook(
          { rawBody: Buffer.from('{"id":"evt_123"}') } as unknown as RawBodyRequest<Request> & { rawBody?: Buffer },
          '' as unknown as string,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should construct event and delegate to SubscriptionService', async () => {
      configService.get.mockReturnValue('whsec_test');

      const event = {
        id: 'evt_123',
        type: 'invoice.payment_succeeded',
        data: { object: {} },
      } as unknown as Stripe.Event;
      stripeService.constructWebhookEvent.mockReturnValue(event);

      const result = await controller.handleStripeWebhook(
        { rawBody: Buffer.from('{"id":"evt_123"}') } as unknown as RawBodyRequest<Request> & { rawBody?: Buffer },
        'sig',
      );

      expect(stripeService.constructWebhookEvent).toHaveBeenCalledWith(expect.any(Buffer), 'sig', 'whsec_test');
      expect(subscriptionService.handleWebhookEvent).toHaveBeenCalledWith(event);
      expect(result).toEqual({ received: true });
    });

    it('should throw BadRequestException when Stripe signature verification fails', async () => {
      configService.get.mockReturnValue('whsec_test');
      stripeService.constructWebhookEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const loggerSpy = jest.spyOn((controller as unknown as { logger: Logger }).logger, 'warn');

      await expect(
        controller.handleStripeWebhook(
          { rawBody: Buffer.from('{"id":"evt_123"}') } as unknown as RawBodyRequest<Request> & { rawBody?: Buffer },
          'sig',
        ),
      ).rejects.toThrow(BadRequestException);

      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('Stripe webhook signature verification failed'));
    });
  });
});
