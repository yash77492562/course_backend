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
        port: parseInt(process.env.UPLOAD_DIRECT_VIDEO_PORT) || 3024,
      },
    },
  );

  await app.listen();
  console.log('🎬 Upload Direct Video Service is listening on port 3024');
}

bootstrap();
