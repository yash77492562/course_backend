import { Module } from '@nestjs/common';
import { ContactService } from '../services/contact.service';
import { PrismaService } from '../../database/prisma/service/prisma.service';

@Module({
  providers: [ContactService, PrismaService],
  exports: [ContactService],
})
export class ContactModule {}
