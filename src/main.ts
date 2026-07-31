import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3001',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('etag', false);

  // Stripe webhook requires raw body for signature verification.
  // Other endpoints use standard JSON body parsing.
  expressApp.use((req: any, res: any, next: any) => {
    if (req.path === '/subscriptions/webhook') {
      express.raw({ type: 'application/json' })(req, res, next);
    } else {
      express.json()(req, res, next);
    }
  });
  expressApp.use(express.urlencoded({ extended: true }));

  expressApp.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    next();
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') ?? 5000;
  await app.listen(port);
}
bootstrap();
