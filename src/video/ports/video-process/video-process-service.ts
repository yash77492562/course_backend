import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { VideoProcessModule } from './video-process.module';

async function bootstrap() {
  const app = await NestFactory.create(VideoProcessModule);
  
  app.useGlobalPipes(new ValidationPipe());
  app.enableCors();

  const port = parseInt(process.env.VIDEO_PROCESS_PORT) || 3013;
  await app.listen(port);
  
  console.log(`⚙️  Video Process Service is listening on port ${port}`);
}

bootstrap();
