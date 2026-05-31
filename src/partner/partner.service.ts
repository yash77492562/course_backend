import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma/service/prisma.service';
import { CreatePartnerDto } from './dto/create-partner.dto';

@Injectable()
export class PartnerService {
  constructor(private readonly prisma: PrismaService) {}

  async createPartner(createPartnerDto: CreatePartnerDto, ipAddress?: string, userAgent?: string) {
    try {
      // Check if email already exists
      const existingPartner = await this.prisma.partner.findFirst({
        where: { email: createPartnerDto.email },
      });

      if (existingPartner) {
        throw new BadRequestException('An application with this email already exists');
      }

      // Create partner application
      const partner = await this.prisma.partner.create({
        data: {
          ...createPartnerDto,
          ipAddress,
          userAgent,
        },
      });

      return {
        success: true,
        message: 'Partner application submitted successfully',
        data: {
          id: partner.id,
          email: partner.email,
          createdAt: partner.createdAt,
        },
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to submit partner application');
    }
  }

  async getAllPartners(status?: string) {
    const where = status ? { status: status as any } : {};
    
    return await this.prisma.partner.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getPartnerById(id: string) {
    return await this.prisma.partner.findUnique({
      where: { id },
    });
  }

  async updatePartnerStatus(id: string, status: string) {
    const validStatuses = ['NEW', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'];
    if (!validStatuses.includes(status)) {
      throw new BadRequestException('Invalid status');
    }
    
    return await this.prisma.partner.update({
      where: { id },
      data: {
        status: status as any,
        reviewedAt: new Date(),
      },
    });
  }
}
