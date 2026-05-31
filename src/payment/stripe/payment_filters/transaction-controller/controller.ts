import {
  Controller,
  Get,
  Param,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { AllPaymentsHandler } from '../all_payments/all';
import { AllSuccessPaymentsHandler } from '../all_payments/success';
import { AllCanceledPaymentsHandler } from '../all_payments/cancel ';
import { AllProcessingPaymentsHandler } from '../all_payments/process';
import { UserAllPaymentsHandler } from '../user_specfic/all';
import { UserSuccessPaymentsHandler } from '../user_specfic/success_payment';
import { UserCanceledPaymentsHandler } from '../user_specfic/cancel_payment';
import { UserProcessingPaymentsHandler } from '../user_specfic/process_payment';

@Controller('payment/stripe/transactions')
export class TransactionController {
  constructor(
    private readonly allPaymentsHandler: AllPaymentsHandler,
    private readonly allSuccessPaymentsHandler: AllSuccessPaymentsHandler,
    private readonly allCanceledPaymentsHandler: AllCanceledPaymentsHandler,
    private readonly allProcessingPaymentsHandler: AllProcessingPaymentsHandler,
    private readonly userAllPaymentsHandler: UserAllPaymentsHandler,
    private readonly userSuccessPaymentsHandler: UserSuccessPaymentsHandler,
    private readonly userCanceledPaymentsHandler: UserCanceledPaymentsHandler,
    private readonly userProcessingPaymentsHandler: UserProcessingPaymentsHandler,
  ) {}

  // ==================== ALL USERS TRANSACTIONS ====================

  /**
   * Get ALL transactions for ALL users
   * GET /payment/stripe/transactions/all
   * Admin only
   */
  @Get('all')
  async getAllTransactions(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.allPaymentsHandler.getAllTransactions(page, limit);
  }

  /**
   * Get all SUCCESSFUL transactions for ALL users
   * GET /payment/stripe/transactions/all/success
   * Admin only
   */
  @Get('all/success')
  async getAllSuccessfulTransactions(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.allSuccessPaymentsHandler.getAllSuccessfulTransactions(page, limit);
  }

  /**
   * Get all FAILED/CANCELED transactions for ALL users
   * GET /payment/stripe/transactions/all/canceled
   * Admin only
   */
  @Get('all/canceled')
  async getAllCanceledTransactions(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.allCanceledPaymentsHandler.getAllCanceledTransactions(page, limit);
  }

  /**
   * Get all PROCESSING transactions for ALL users
   * GET /payment/stripe/transactions/all/processing
   * Admin only
   */
  @Get('all/processing')
  async getAllProcessingTransactions(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.allProcessingPaymentsHandler.getAllProcessingTransactions(page, limit);
  }

  // ==================== SPECIFIC USER TRANSACTIONS ====================

  /**
   * Get ALL transactions for a SPECIFIC user
   * GET /payment/stripe/transactions/user/:userId
   */
  @Get('user/:userId')
  async getUserAllTransactions(
    @Param('userId') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.userAllPaymentsHandler.getUserAllTransactions(userId, page, limit);
  }

  /**
   * Get SUCCESSFUL transactions for a SPECIFIC user
   * GET /payment/stripe/transactions/user/:userId/success
   */
  @Get('user/:userId/success')
  async getUserSuccessfulTransactions(
    @Param('userId') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.userSuccessPaymentsHandler.getUserSuccessfulTransactions(userId, page, limit);
  }

  /**
   * Get FAILED/CANCELED transactions for a SPECIFIC user
   * GET /payment/stripe/transactions/user/:userId/canceled
   */
  @Get('user/:userId/canceled')
  async getUserCanceledTransactions(
    @Param('userId') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.userCanceledPaymentsHandler.getUserCanceledTransactions(userId, page, limit);
  }

  /**
   * Get PROCESSING transactions for a SPECIFIC user
   * GET /payment/stripe/transactions/user/:userId/processing
   */
  @Get('user/:userId/processing')
  async getUserProcessingTransactions(
    @Param('userId') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.userProcessingPaymentsHandler.getUserProcessingTransactions(userId, page, limit);
  }
}
