import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { UserModule } from '../../modules/user.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    UserModule,
    {
      transport: Transport.TCP,
      options: {
        host: 'localhost',
        port: parseInt(process.env.USER_LOGIN_PORT) || 3006,
      },
    },
  );

  await app.listen();
  console.log('🔐 User Login Service is listening on port 3006');
}

bootstrap();