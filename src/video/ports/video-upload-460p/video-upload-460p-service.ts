import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { VideoUpload460pModule } from './video-upload-460p.module';

async function bootstrap() {
  const app = await NestFactory.create(VideoUpload460pModule);
  
  app.useGlobalPipes(new ValidationPipe({
    transform: true, // Enable transformation for @Transform() decorators
    whitelist: true,
  }));
  app.enableCors();

  const port = parseInt(process.env.VIDEO_UPLOAD_460P_PORT) || 3010;
  await app.listen(port);
  
  console.log(`🎬 Video Upload 460p Service is listening on port ${port}`);
}

bootstrap();
