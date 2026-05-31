import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { VideoUpload1080pModule } from './video-upload-1080p.module';

async function bootstrap() {
  const app = await NestFactory.create(VideoUpload1080pModule);
  
  app.useGlobalPipes(new ValidationPipe({
    transform: true, // Enable transformation for @Transform() decorators
    whitelist: true,
  }));
  app.enableCors();

  const port = parseInt(process.env.VIDEO_UPLOAD_1080P_PORT) || 3012;
  await app.listen(port);
  
  console.log(`🎬 Video Upload 1080p Service is listening on port ${port}`);
}

bootstrap();
