import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

// The workspace .env lives at the repo root, but Nest runs with cwd = apps/api.
const candidates = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '../../.env'), // repo root: apps/api -> ../../
  join(__dirname, '..', '.env'),        // compiled dist/main.js is at apps/api/dist/
];
for (const path of candidates) {
  if (existsSync(path)) {
    loadEnv({ path });
    break;
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());

  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown fields from DTOs
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
  console.log(`API listening on http://localhost:${port}/api (env: ${process.env.NODE_ENV ?? 'development'})`);
}

void bootstrap();