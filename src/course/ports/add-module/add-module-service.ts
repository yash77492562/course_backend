import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { CourseModule } from '../../modules/course.module';

async function bootstrap() {
  const port = parseInt(process.env.COURSE_ADD_MODULE_PORT) || 3035;
  
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
  console.log(`📚 Course Add Module Service is listening on port ${port}`);
}

bootstrap();
