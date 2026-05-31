import {
  Controller,
  Post,
  Body,
  Headers,
  RawBodyRequest,
  Req,
  HttpCode,
  HttpStatus,
  Get,
  Param,
} from '@nestjs/common';
import { StripeService } from '../services/service';
import { CreateOrderDto } from '../dto/create-order';
import { Request } from 'express';

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
    @Req() req: RawBodyRequest<Request>,
  ) {
    const rawBody = req.rawBody;
    
    if (!rawBody) {
      throw new Error('Raw body is required for webhook signature verification');
    }

    return this.stripeService.handleStripeWebhook(rawBody, signature);
  }

  // Get payment status
  @Get('status/:paymentIntentId')
  async getPaymentStatus(@Param('paymentIntentId') paymentIntentId: string) {
    return this.stripeService.getPaymentStatus(paymentIntentId);
  }
}
