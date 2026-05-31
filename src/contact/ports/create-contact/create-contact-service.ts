import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { ValidationPipe } from '@nestjs/common';
import { CreateContactModule } from './create-contact.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    CreateContactModule,
    {
      transport: Transport.TCP,
      options: {
        host: 'localhost',
        port: parseInt(process.env.CONTACT_CREATE_PORT) || 3030,
      },
    },
  );

  app.useGlobalPipes(new ValidationPipe());

  await app.listen();
  console.log(`📧 Contact Create Service is listening on port ${process.env.CONTACT_CREATE_PORT || 3030}`);
}

bootstrap();
