import { Module } from '@nestjs/common';
import { StripeController } from './controllers/controller';
import { StripeService } from './services/service';
import { ProcessPaymentHandler } from './process/payment-handler';
import { SuccessPaymentHandler } from './success/payment-handler';
import { CancelPaymentHandler } from './cancel/payment-handler';
import { InvoiceController } from './invoice/invoice-controller/controller';
import { InvoiceHandler } from './invoice/invoice-handler';
import { TransactionController } from './payment_filters/transaction-controller/controller';
import { AllPaymentsHandler } from './payment_filters/all_payments/all';
import { AllSuccessPaymentsHandler } from './payment_filters/all_payments/success';
import { AllCanceledPaymentsHandler } from './payment_filters/all_payments/cancel ';
import { AllProcessingPaymentsHandler } from './payment_filters/all_payments/process';
import { UserAllPaymentsHandler } from './payment_filters/user_specfic/all';
import { UserSuccessPaymentsHandler } from './payment_filters/user_specfic/success_payment';
import { UserCanceledPaymentsHandler } from './payment_filters/user_specfic/cancel_payment';
import { UserProcessingPaymentsHandler } from './payment_filters/user_specfic/process_payment';
import { TestWebhookController } from './test/test-webhook-controller';
import { PrismaService } from '../../database/prisma/service/prisma.service';
import { CacheHelperModule } from '../../cache/cache.module';

@Module({
  imports: [CacheHelperModule],
  controllers: [StripeController, InvoiceController, TransactionController, TestWebhookController],
  providers: [
    StripeService,
    ProcessPaymentHandler,
    SuccessPaymentHandler,
    CancelPaymentHandler,
    InvoiceHandler,
    // Transaction filters - All users
    AllPaymentsHandler,
    AllSuccessPaymentsHandler,
    AllCanceledPaymentsHandler,
    AllProcessingPaymentsHandler,
    // Transaction filters - Specific user
    UserAllPaymentsHandler,
    UserSuccessPaymentsHandler,
    UserCanceledPaymentsHandler,
    UserProcessingPaymentsHandler,
    PrismaService,
  ],
  exports: [StripeService, InvoiceHandler, UserAllPaymentsHandler, AllPaymentsHandler],
})
export class StripeModule {}
