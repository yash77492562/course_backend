import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { CourseModule } from '../../modules/course.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    CourseModule,
    {
      transport: Transport.TCP,
      options: {
        host: 'localhost',
        port: parseInt(process.env.COURSE_GET_LESSON_PORT) || 3021,
      },
    },
  );

  await app.listen();
  console.log('📄 Course Get Lesson Service is listening on port 3021');
}

bootstrap();
