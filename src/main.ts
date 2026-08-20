import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import * as express from 'express';
import helmet from 'helmet';

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
  // Trust the reverse proxy in front of us so req.ip — which the rate limiter
  // keys on — is the real client address rather than the proxy's.
  expressApp.set('trust proxy', 1);

  // `contentSecurityPolicy: false`: this process serves JSON and file
  // downloads, never HTML pages of its own, so a CSP here protects nothing and
  // would only fight the Swagger UI. `nosniff` is the header that matters for
  // us — see AttachmentsController.download, which streams user-uploaded bytes.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(compression());

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
  const logger = new Logger('Bootstrap');

  // Swagger enumerates every route, DTO field and validation rule — a
  // reconnaissance gift. Opt in explicitly, and never in production.
  const swaggerEnabled =
    configService.get<string>('ENABLE_SWAGGER') === 'true' &&
    configService.get<string>('NODE_ENV') !== 'production';

  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('CRM API')
      .setDescription('REST API for the CRM backend')
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access-token',
      )
      .build();
    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api', app, swaggerDocument);
    logger.warn('Swagger UI is exposed at /api (ENABLE_SWAGGER=true)');
  }

  // Finish in-flight requests and let @nestjs/schedule cron jobs unwind on
  // SIGTERM instead of dropping them mid-execution.
  app.enableShutdownHooks();

  const port = configService.get<number>('PORT') ?? 5000;
  await app.listen(port);
  logger.log(`Listening on port ${port}`);
}
void bootstrap();
