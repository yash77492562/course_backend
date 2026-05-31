import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { UploadModule } from '../../upload.module';

async function bootstrap() {
  const port = parseInt(process.env.UPLOAD_INITIATE_PORT) || 3024;
  
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    UploadModule,
    {
      transport: Transport.TCP,
      options: {
        host: 'localhost',
        port,
      },
    },
  );

  await app.listen();
  console.log(`🚀 Upload Initiate Service is listening on port ${port}`);
}

bootstrap();
