import {
  Controller,
  Post,
  Body,
  Headers,
  Req,
  HttpCode,
  HttpStatus,
  Get,
  Param,
  BadRequestException,
} from '@nestjs/common';
import { StripeService } from '../services/service';
import { CreateOrderDto } from '../dto/create-order';
import { Request } from 'express';

// Extend Express Request to include rawBody (added by NestJS with rawBody: true option)
interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

@Controller('payment/stripe')
export class StripeController {
  constructor(private readonly stripeService: StripeService) {}

  // Create order and payment intent
  @Post('create-order')
  // @UseGuards(AuthGuard) // Add your auth guard here
  async createOrder(
    @Body() createOrderDto: CreateOrderDto,
    @Req() req: any,
    @Headers('x-user-id') userId?: string,
  ) {
    // Get userId from header or body (for testing)
    const userIdToUse = userId || req.body.userId || req.headers['x-user-id'];
    
    if (!userIdToUse) {
      throw new Error('User ID is required. Provide x-user-id header or userId in body');
    }
    
    return this.stripeService.createOrder(userIdToUse, createOrderDto);
  }

  // Get order details
  @Get('order/:orderId')
  async getOrder(@Param('orderId') orderId: string) {
    return this.stripeService.getOrder(orderId);
  }

  // Get order status for polling (Step 5 - Order Status API)
  @Get('order/:orderId/status')
  async getOrderStatus(@Param('orderId') orderId: string) {
    return this.stripeService.getOrderStatus(orderId);
  }

  // Get user's orders
  @Get('orders/user/:userId')
  async getUserOrders(@Param('userId') userId: string) {
    return this.stripeService.getUserOrders(userId);
  }

  // Get user's purchase history
  @Get('purchase-history/:userId')
  async getUserPurchaseHistory(@Param('userId') userId: string) {
    return this.stripeService.getUserPurchaseHistory(userId);
  }

  // Stripe webhook endpoint
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleStripeWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: RequestWithRawBody,
  ) {
    // NestJS with rawBody: true provides req.rawBody as Buffer
    // This is preserved even when body is parsed as JSON
    const rawBody = req.rawBody;
    
    // Validate raw body exists and is a Buffer
    if (!rawBody || !Buffer.isBuffer(rawBody)) {
      console.error('❌ CRITICAL: Raw body is not a Buffer!');
      console.error('  - rawBody exists:', !!rawBody);
      console.error('  - rawBody type:', typeof rawBody);
      console.error('  - rawBody is Buffer:', Buffer.isBuffer(rawBody));
      console.error('  - rawBody constructor:', rawBody?.constructor?.name);
      console.error('  - req.body exists:', !!req.body);
      console.error('  - req.body type:', typeof req.body);
      console.error('⚠️  NestJS rawBody option may not be enabled in main.ts');
      console.error('⚠️  Ensure: NestFactory.create(AppModule, { rawBody: true })');
      
      throw new BadRequestException(
        'Webhook configuration error: raw body required. Contact support.'
      );
    }

    // Validate signature header exists
    if (!signature) {
      console.error('❌ CRITICAL: Stripe signature header missing!');
      console.error('  - Headers received:', Object.keys(req.headers).join(', '));
      
      throw new BadRequestException(
        'Stripe signature header (stripe-signature) is required'
      );
    }

    console.log('✅ Webhook prerequisites validated');
    console.log(`  - Raw body: ${rawBody.length} bytes`);
    console.log(`  - Signature: ${signature.substring(0, 20)}...`);

    // Pass validated data to service
    return this.stripeService.handleStripeWebhook(rawBody, signature);
  }

  // Webhook health check endpoint for debugging
  @Get('webhook/health')
  async webhookHealthCheck() {
    const hasWebhookSecret = !!process.env.STRIPE_WEBHOOK_SECRET;
    const hasStripeKey = !!process.env.STRIPE_SECRET_KEY;
    
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      config: {
        webhookSecretConfigured: hasWebhookSecret,
        stripeKeyConfigured: hasStripeKey,
        nodeEnv: process.env.NODE_ENV,
      },
      instructions: {
        testWebhook: 'Use Stripe CLI: stripe listen --forward-to http://localhost:3002/payment/stripe/webhook',
        triggerTest: 'stripe trigger checkout.session.completed',
      },
    };
  }

  // Get payment status
  @Get('status/:paymentIntentId')
  async getPaymentStatus(@Param('paymentIntentId') paymentIntentId: string) {
    return this.stripeService.getPaymentStatus(paymentIntentId);
  }
}
