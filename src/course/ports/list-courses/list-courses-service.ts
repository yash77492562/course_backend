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
        port: parseInt(process.env.COURSE_LIST_PORT) || 3014,
      },
    },
  );

  await app.listen();
  console.log('📋 Course List Service is listening on port 3014');
}

bootstrap();
