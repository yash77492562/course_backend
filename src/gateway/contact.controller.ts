import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { ClientProxy, ClientProxyFactory, Transport } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { CreateContactDto } from '../contact/dto/create-contact.dto';

@Controller('contact')
export class ContactController {
  private createContactClient: ClientProxy;

  constructor() {
    this.createContactClient = ClientProxyFactory.create({
      transport: Transport.TCP,
      options: {
        host: 'localhost',
        port: parseInt(process.env.CONTACT_CREATE_PORT) || 3030,
      },
    });
  }

  /**
   * Submit contact form
   * POST /contact
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createContact(@Body() dto: CreateContactDto, @Req() req: any) {
    try {
      // Extract metadata for spam prevention
      const metadata = {
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
      };

      const result = await firstValueFrom(
        this.createContactClient.send('contact.create', { dto, metadata })
      );

      if (!result.success) {
        return {
          success: false,
          status_code: HttpStatus.BAD_REQUEST,
          message: result.message,
        };
      }

      return {
        success: true,
        status_code: HttpStatus.CREATED,
        message: result.message,
        data: result.data,
      };
    } catch (error) {
      console.error('Contact submission error:', error);
      return {
        success: false,
        status_code: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Failed to submit contact form. Please try again.',
      };
    }
  }
}
