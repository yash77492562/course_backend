import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { PartnerService } from '../partner/partner.service';
import { CreatePartnerDto } from '../partner/dto/create-partner.dto';
import { Request } from 'express';

@Controller('partner')
export class PartnerController {
  constructor(private readonly partnerService: PartnerService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createPartner(@Body() createPartnerDto: CreatePartnerDto, @Req() req: Request) {
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    return await this.partnerService.createPartner(createPartnerDto, ipAddress, userAgent);
  }
}
