import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { VideoUpload720pModule } from './video-upload-720p.module';

async function bootstrap() {
  const app = await NestFactory.create(VideoUpload720pModule);
  
  app.useGlobalPipes(new ValidationPipe({
    transform: true, // Enable transformation for @Transform() decorators
    whitelist: true,
  }));
  app.enableCors();

  const port = parseInt(process.env.VIDEO_UPLOAD_720P_PORT) || 3011;
  await app.listen(port);
  
  console.log(`🎬 Video Upload 720p Service is listening on port ${port}`);
}

bootstrap();
