import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { config } from './config.js';

export function setup(app: NestExpressApplication) {
  app.enableCors({ origin: config.webUrls });
  app.enableShutdownHooks();
  return app;
}

if (!process.env.VITEST) {
  const app = setup(await NestFactory.create<NestExpressApplication>(AppModule));
  await app.listen(config.port);
}
