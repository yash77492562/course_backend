import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { PartnerService } from './partner.service';
import { CreatePartnerDto } from './dto/create-partner.dto';
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

  @Get()
  async getAllPartners(@Query('status') status?: string) {
    const partners = await this.partnerService.getAllPartners(status);
    return {
      success: true,
      data: partners,
    };
  }

  @Get(':id')
  async getPartnerById(@Param('id') id: string) {
    const partner = await this.partnerService.getPartnerById(id);
    return {
      success: true,
      data: partner,
    };
  }

  @Patch(':id/status')
  async updatePartnerStatus(@Param('id') id: string, @Body('status') status: string) {
    const partner = await this.partnerService.updatePartnerStatus(id, status);
    return {
      success: true,
      message: 'Partner status updated successfully',
      data: partner,
    };
  }
}
