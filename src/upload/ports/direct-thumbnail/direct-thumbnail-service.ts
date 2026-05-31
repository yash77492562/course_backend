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
        port: parseInt(process.env.UPLOAD_DIRECT_THUMBNAIL_PORT) || 3025,
      },
    },
  );

  await app.listen();
  console.log('🖼️  Upload Direct Thumbnail Service is listening on port 3025');
}

bootstrap();
