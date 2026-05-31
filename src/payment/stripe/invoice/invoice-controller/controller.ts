import {
  Controller,
  Get,
  Param,
  Post,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceHandler } from '../invoice-handler';

@Controller('payment/stripe/invoice')
export class InvoiceController {
  constructor(private readonly invoiceHandler: InvoiceHandler) {}

  /**
   * Get invoice URL for an order
   * GET /payment/stripe/invoice/:orderId/url
   */
  @Get(':orderId/url')
  async getInvoiceUrl(@Param('orderId') orderId: string) {
    const invoiceUrl = await this.invoiceHandler.getInvoiceUrl(orderId);
    
    if (!invoiceUrl) {
      throw new NotFoundException('Invoice not available');
    }

    return {
      success: true,
      invoiceUrl,
    };
  }

  /**
   * Get invoice details for an order
   * GET /payment/stripe/invoice/:orderId/details
   */
  @Get(':orderId/details')
  async getInvoiceDetails(@Param('orderId') orderId: string) {
    const details = await this.invoiceHandler.getInvoiceDetails(orderId);
    
    return {
      success: true,
      invoice: details,
    };
  }

  /**
   * Get all invoices for a user
   * GET /payment/stripe/invoice/user/:userId
   */
  @Get('user/:userId')
  async getUserInvoices(@Param('userId') userId: string) {
    const invoices = await this.invoiceHandler.getUserInvoices(userId);
    
    return {
      success: true,
      invoices,
    };
  }

  /**
   * Download invoice PDF
   * GET /payment/stripe/invoice/:orderId/download
   */
  @Get(':orderId/download')
  async downloadInvoice(@Param('orderId') orderId: string) {
    const invoiceUrl = await this.invoiceHandler.downloadInvoicePdf(orderId);
    
    return {
      success: true,
      downloadUrl: invoiceUrl,
    };
  }

  /**
   * Send invoice email to customer
   * POST /payment/stripe/invoice/:orderId/send-email
   */
  @Post(':orderId/send-email')
  @HttpCode(HttpStatus.OK)
  async sendInvoiceEmail(@Param('orderId') orderId: string) {
    const sent = await this.invoiceHandler.sendInvoiceEmail(orderId);
    
    return {
      success: sent,
      message: sent ? 'Invoice email sent successfully' : 'Failed to send invoice email',
    };
  }
}
