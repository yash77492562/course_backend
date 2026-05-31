import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { CourseModule } from '../../modules/course.module';

async function bootstrap() {
  const port = parseInt(process.env.COURSE_READ_PORT) || 3014;
  
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    CourseModule,
    {
      transport: Transport.TCP,
      options: {
        host: 'localhost',
        port,
      },
    },
  );

  await app.listen();
  console.log(`📖 Course Read Service is listening on port ${port}`);
}

bootstrap();
