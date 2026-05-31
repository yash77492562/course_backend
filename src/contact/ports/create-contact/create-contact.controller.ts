import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { ContactService } from '../../services/contact.service';
import { CreateContactDto } from '../../dto/create-contact.dto';

@Controller()
export class CreateContactController {
  constructor(private readonly contactService: ContactService) {}

  @MessagePattern('contact.create')
  async createContact(payload: { dto: CreateContactDto; metadata?: any }) {
    return this.contactService.createContact(payload.dto, payload.metadata);
  }
}
