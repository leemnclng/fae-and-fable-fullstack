import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';
import { AppModule } from './app.module.js';
import { config } from './config.js';

export function setup(app: NestExpressApplication) {
  app.enableCors({ origin: config.webUrl });
  app.useStaticAssets(join(config.uploadsDir, 'public'), { prefix: '/files/', maxAge: '7d' });
  app.enableShutdownHooks();
  return app;
}

if (!process.env.VITEST) {
  const app = setup(await NestFactory.create<NestExpressApplication>(AppModule));
  await app.listen(config.port);
}
