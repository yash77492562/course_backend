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
        port: parseInt(process.env.UPLOAD_UPDATE_LESSON_PORT) || 3022,
      },
    },
  );

  await app.listen();
  console.log('💾 Upload Update Lesson Qualities Service is listening on port 3022');
}

bootstrap();
