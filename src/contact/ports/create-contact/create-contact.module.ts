import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CreateContactController } from './create-contact.controller';
import { ContactModule } from '../../modules/contact.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ContactModule,
  ],
  controllers: [CreateContactController],
})
export class CreateContactModule {}
