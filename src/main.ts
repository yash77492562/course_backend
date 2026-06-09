import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { logger } from './lib/logger.service';

// Import BullMQ workers
import { videoWorker } from './queues/workers/video.worker';
import { cacheWorker } from './queues/workers/cache.worker';
import { notificationWorker } from './queues/workers/notification.worker';
import { paymentWorker } from './queues/workers/payment.worker';
import { refreshWorker } from './queues/workers/refresh.worker';
import { maintenanceWorker } from './queues/workers/maintenance.worker';

async function bootstrap() {
  // Create NestJS app with raw body support for webhooks
  const app = await NestFactory.create(AppModule, {
    logger: process.env.NODE_ENV === 'production' 
      ? ['error', 'warn'] 
      : ['log', 'error', 'warn', 'debug'],
    abortOnError: false,
    // Enable raw body for webhook signature verification
    rawBody: true,
  });
  
  // Enable CORS for admin panel and Docker network
  const corsOrigins = process.env.CORS_ORIGIN 
    ? process.env.CORS_ORIGIN.split(',')
    : ['http://localhost:3001', 'http://localhost:3000'];
  
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, Postman, or same-origin)
      if (!origin) {
        return callback(null, true);
      }
      
      // Allow all origins for video streaming endpoints
      // This is safe because video content is public
      if (origin) {
        return callback(null, true);
      }
      
      // Check if origin is in allowed list
      if (corsOrigins.includes(origin)) {
        return callback(null, true);
      }
      
      // Reject other origins
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    exposedHeaders: ['Content-Length', 'Content-Range', 'Content-Type'],
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Range', 'x-user-id', 'stripe-signature'],
  });

  // Configure body size limits
  // rawBody: true automatically preserves raw body for webhook verification
  // Configure body size limits
  const express = require('express');
  
  // Custom JSON parser with a verify function to safely capture the raw Buffer
  app.use(express.json({ 
    limit: '6gb',
    verify: (req: any, res, buf) => {
      // Only intercept the raw buffer for the Stripe webhook route
      if (req.originalUrl && req.originalUrl.includes('/webhook')) {
        req.rawBody = buf;
      }
    }
  }));
  
  app.use(express.urlencoded({ limit: '6gb', extended: true }));

  // NOTE: No global prefix - routes are accessed directly (e.g., /auth/login, /courses/public)
  // This keeps dev and production consistent

  // Enable validation pipes with optimizations
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    // Disable detailed errors in production for performance
    disableErrorMessages: process.env.NODE_ENV === 'production',
  }));

  // Start BullMQ workers - they run automatically when imported
  // Using void to ensure workers are not tree-shaken by bundlers
  void videoWorker;
  void cacheWorker;
  void notificationWorker;
  void paymentWorker;
  void refreshWorker;
  void maintenanceWorker;
  
  logger.info('✅ BullMQ workers running', {
    workers: ['video', 'cache', 'notification', 'payment', 'refresh', 'maintenance']
  });

  const port = process.env.PORT || 3002;
  
  // Start Contact microservice on port 3030
  console.log('📧 Starting Contact microservice on port 3030...');
  app.connectMicroservice({
    transport: 1, // Transport.TCP
    options: {
      host: 'localhost',
      port: parseInt(process.env.CONTACT_CREATE_PORT) || 3030,
    },
  });
  
  // Start all microservices
  await app.startAllMicroservices();
  console.log('✅ All microservices started (Contact on port 3030)');
  
  await app.listen(port);
  console.log(`🚀 Gateway running on: http://localhost:${port}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV }`);
  console.log(`📦 Max upload size: 6GB`);
  console.log(`🔄 BullMQ workers: ACTIVE`);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received - shutting down gracefully`);
    
    await Promise.all([
      videoWorker.close(),
      cacheWorker.close(),
      notificationWorker.close(),
      paymentWorker.close(),
      refreshWorker.close(),
      maintenanceWorker.close(),
    ]);
    
    await app.close();
    logger.info('Application shut down successfully');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap();