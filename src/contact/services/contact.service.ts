import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/service/prisma.service';
import { CreateContactDto } from '../dto/create-contact.dto';

@Injectable()
export class ContactService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a new contact inquiry
   */
  async createContact(dto: CreateContactDto, metadata?: { ipAddress?: string; userAgent?: string }) {
    try {
      const contact = await this.prisma.contact.create({
        data: {
          name: dto.name,
          email: dto.email,
          phone: dto.phone,
          subject: dto.subject,
          message: dto.message,
          ipAddress: metadata?.ipAddress,
          userAgent: metadata?.userAgent,
          status: 'NEW',
        },
      });

      console.log('✅ Contact inquiry created:', contact.id);

      return {
        success: true,
        message: 'Thank you for contacting us! We will get back to you soon.',
        data: {
          id: contact.id,
          createdAt: contact.createdAt,
        },
      };
    } catch (error) {
      console.error('❌ Error creating contact:', error);
      return {
        success: false,
        message: 'Failed to submit contact form. Please try again.',
      };
    }
  }

  /**
   * Get all contacts (for admin)
   */
  async getAllContacts(status?: string) {
    try {
      const where = status ? { status: status as any } : {};
      
      const contacts = await this.prisma.contact.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });

      return {
        success: true,
        data: contacts,
      };
    } catch (error) {
      console.error('❌ Error fetching contacts:', error);
      return {
        success: false,
        message: 'Failed to fetch contacts',
      };
    }
  }

  /**
   * Update contact status (for admin)
   */
  async updateContactStatus(id: string, status: string) {
    try {
      const contact = await this.prisma.contact.update({
        where: { id },
        data: {
          status: status as any,
          respondedAt: status === 'RESPONDED' ? new Date() : undefined,
        },
      });

      return {
        success: true,
        message: 'Contact status updated',
        data: contact,
      };
    } catch (error) {
      console.error('❌ Error updating contact:', error);
      return {
        success: false,
        message: 'Failed to update contact status',
      };
    }
  }
}
