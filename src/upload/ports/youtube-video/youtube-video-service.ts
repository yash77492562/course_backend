import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { UploadModule } from '../../upload.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    UploadModule,
    {
      transport: Transport.TCP,
      options: {
        host: 'localhost',
        port: parseInt(process.env.UPLOAD_YOUTUBE_PORT) || 3023,
      },
    },
  );

  await app.listen();
  console.log('🎥 Upload YouTube Video Service is listening on port 3023');
}

bootstrap();
