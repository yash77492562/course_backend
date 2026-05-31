import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { GatewayModule } from './gateway.module';
import { json } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(GatewayModule, {
    rawBody: true, // Enable raw body for webhook verification
  });
  
  // Enable CORS for admin panel and frontend
  app.enableCors({
    origin: ['http://localhost:3000', 'http://localhost:3001'], // Admin and frontend URLs
    credentials: true,
  });

  // Enable validation pipes
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  const port = process.env.GATEWAY_PORT || 3002;
  await app.listen(port);
  console.log(`Gateway is running on: http://localhost:${port}`);
}

bootstrap();