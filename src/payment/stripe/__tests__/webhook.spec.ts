import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { StripeController } from '../controllers/controller';
import { StripeService } from '../services/service';
import { Request } from 'express';
import Stripe from 'stripe';

describe('StripeController - Webhook', () => {
  let controller: StripeController;
  let service: StripeService;

  const mockStripeService = {
    handleStripeWebhook: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StripeController],
      providers: [
        {
          provide: StripeService,
          useValue: mockStripeService,
        },
      ],
    }).compile();

    controller = module.get<StripeController>(StripeController);
    service = module.get<StripeService>(StripeService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleStripeWebhook', () => {
    it('should throw BadRequestException when rawBody is missing', async () => {
      // Arrange
      const mockReq = {
        rawBody: undefined,
      } as any;
      const signature = 't=1234567890,v1=signature_hash';

      // Act & Assert
      await expect(
        controller.handleStripeWebhook(signature, mockReq)
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.handleStripeWebhook(signature, mockReq)
      ).rejects.toThrow('Raw body is required for webhook signature verification');

      expect(mockStripeService.handleStripeWebhook).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when rawBody is not a Buffer', async () => {
      // Arrange
      const mockReq = {
        rawBody: 'not a buffer' as any,
      } as any;
      const signature = 't=1234567890,v1=signature_hash';

      // Act & Assert
      await expect(
        controller.handleStripeWebhook(signature, mockReq)
      ).rejects.toThrow(BadRequestException);

      expect(mockStripeService.handleStripeWebhook).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when signature is missing', async () => {
      // Arrange
      const mockReq = {
        rawBody: Buffer.from('{"test": "data"}'),
      } as any;
      const signature = undefined as any;

      // Act & Assert
      await expect(
        controller.handleStripeWebhook(signature, mockReq)
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.handleStripeWebhook(signature, mockReq)
      ).rejects.toThrow('Stripe signature header is required');

      expect(mockStripeService.handleStripeWebhook).not.toHaveBeenCalled();
    });

    it('should pass Buffer directly to service when valid', async () => {
      // Arrange
      const rawBody = Buffer.from('{"test": "data"}');
      const mockReq = {
        rawBody,
      } as any;
      const signature = 't=1234567890,v1=signature_hash';
      const mockResponse = { received: true };

      mockStripeService.handleStripeWebhook.mockResolvedValue(mockResponse);

      // Act
      const result = await controller.handleStripeWebhook(signature, mockReq);

      // Assert
      expect(result).toEqual(mockResponse);
      expect(mockStripeService.handleStripeWebhook).toHaveBeenCalledWith(
        rawBody,
        signature
      );
      expect(mockStripeService.handleStripeWebhook).toHaveBeenCalledTimes(1);
    });

    it('should preserve Buffer integrity (not convert to string)', async () => {
      // Arrange
      const originalBytes = Buffer.from('{"amount": 1000, "currency": "usd"}');
      const mockReq = {
        rawBody: originalBytes,
      } as any;
      const signature = 't=1234567890,v1=signature_hash';

      mockStripeService.handleStripeWebhook.mockResolvedValue({ received: true });

      // Act
      await controller.handleStripeWebhook(signature, mockReq);

      // Assert
      const passedBuffer = mockStripeService.handleStripeWebhook.mock.calls[0][0];
      expect(Buffer.isBuffer(passedBuffer)).toBe(true);
      expect(passedBuffer).toBe(originalBytes); // Same reference
      expect(passedBuffer.equals(originalBytes)).toBe(true); // Same bytes
    });
  });
});

describe('StripeService - Webhook Handler', () => {
  let service: StripeService;
  let mockStripe: any;

  const mockPrismaService = {
    order: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    payment: {
      create: jest.fn(),
    },
    user: {
      update: jest.fn(),
    },
  };

  const mockRedisService = {
    del: jest.fn(),
    getOrSet: jest.fn(),
  };

  const mockHandlers = {
    successHandler: {
      handleCheckoutSuccess: jest.fn(),
      handleChargeSuccess: jest.fn(),
      handlePaymentSuccess: jest.fn(),
    },
    cancelHandler: {
      handleCheckoutExpired: jest.fn(),
      handlePaymentFailed: jest.fn(),
      handlePaymentCanceled: jest.fn(),
    },
    processHandler: {
      handlePaymentProcessing: jest.fn(),
      handlePaymentRequiresAction: jest.fn(),
    },
  };

  beforeEach(async () => {
    // Mock Stripe
    mockStripe = {
      webhooks: {
        constructEvent: jest.fn(),
      },
    };

    // Mock environment
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_mock';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeService,
        { provide: 'PrismaService', useValue: mockPrismaService },
        { provide: 'RedisService', useValue: mockRedisService },
        { provide: 'ProcessPaymentHandler', useValue: mockHandlers.processHandler },
        { provide: 'SuccessPaymentHandler', useValue: mockHandlers.successHandler },
        { provide: 'CancelPaymentHandler', useValue: mockHandlers.cancelHandler },
      ],
    }).compile();

    service = module.get<StripeService>(StripeService);
    // Replace real Stripe instance with mock
    (service as any).stripe = mockStripe;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleStripeWebhook', () => {
    it('should verify webhook signature with Buffer', async () => {
      // Arrange
      const rawBody = Buffer.from('{"test": "data"}');
      const signature = 't=1234567890,v1=signature_hash';
      const mockEvent = {
        id: 'evt_test',
        type: 'checkout.session.completed',
        data: {
          object: { id: 'cs_test' },
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);

      // Act
      const result = await service.handleStripeWebhook(rawBody, signature);

      // Assert
      expect(mockStripe.webhooks.constructEvent).toHaveBeenCalledWith(
        rawBody,
        signature,
        'whsec_test_mock'
      );
      expect(result).toEqual({ received: true });
    });

    it('should throw BadRequestException on signature verification failure', async () => {
      // Arrange
      const rawBody = Buffer.from('{"test": "data"}');
      const signature = 'invalid_signature';

      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('No signatures found matching the expected signature for payload');
      });

      // Act & Assert
      await expect(
        service.handleStripeWebhook(rawBody, signature)
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.handleStripeWebhook(rawBody, signature)
      ).rejects.toThrow('Webhook signature verification failed');
    });

    it('should handle checkout.session.completed event', async () => {
      // Arrange
      const rawBody = Buffer.from('{"test": "data"}');
      const signature = 't=1234567890,v1=signature_hash';
      const mockSession = {
        id: 'cs_test',
        payment_status: 'paid',
        metadata: { orderId: 'order_123' },
      };
      const mockEvent = {
        id: 'evt_test',
        type: 'checkout.session.completed',
        data: { object: mockSession },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);

      // Act
      await service.handleStripeWebhook(rawBody, signature);

      // Assert
      expect(mockHandlers.successHandler.handleCheckoutSuccess).toHaveBeenCalledWith(mockSession);
    });

    it('should trim quotes from webhook secret', async () => {
      // Arrange
      process.env.STRIPE_WEBHOOK_SECRET = '"whsec_quoted"';
      const rawBody = Buffer.from('{"test": "data"}');
      const signature = 't=1234567890,v1=signature_hash';
      const mockEvent = {
        id: 'evt_test',
        type: 'checkout.session.completed',
        data: { object: {} },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);

      // Act
      await service.handleStripeWebhook(rawBody, signature);

      // Assert
      expect(mockStripe.webhooks.constructEvent).toHaveBeenCalledWith(
        rawBody,
        signature,
        'whsec_quoted' // Quotes removed
      );
    });
  });
});
