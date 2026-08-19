import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.use(compression());
  app.useBodyParser('json', { limit: '2mb' });
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: process.env.WEB_ORIGIN?.split(',').map((origin) => origin.trim()) ?? ['http://localhost:5173'],
    credentials: true,
  });
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  console.log(`Isaac Spire API listening at http://localhost:${port}/api`);
}

void bootstrap();
