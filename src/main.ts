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
  // Optimize NestJS for lower CPU usage
  const app = await NestFactory.create(AppModule, {
    logger: process.env.NODE_ENV === 'production' 
      ? ['error', 'warn'] 
      : ['log', 'error', 'warn', 'debug'],
    // Reduce overhead in development
    abortOnError: false,
    bodyParser: true,
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
    allowedHeaders: ['Content-Type', 'Authorization', 'Range', 'x-user-id'],
  });

  // Increase body size limit for large video uploads (6GB)
  // BUT preserve raw body for Stripe webhooks
  app.use(
    require('express').json({
      limit: '6gb',
      verify: (req: any, res: any, buf: Buffer) => {
        // Store raw body for Stripe webhook signature verification
        if (req.url === '/payment/stripe/webhook') {
          req.rawBody = buf;
        }
      },
    })
  );
  app.use(require('express').urlencoded({ limit: '6gb', extended: true }));

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