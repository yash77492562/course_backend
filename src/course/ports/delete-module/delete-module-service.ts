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
        port: parseInt(process.env.COURSE_DELETE_MODULE_PORT) || 3020,
      },
    },
  );

  await app.listen();
  console.log('🗑️  Course Delete Module Service is listening on port 3020');
}

bootstrap();
