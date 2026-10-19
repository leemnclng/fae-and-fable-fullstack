import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { config } from './config.js';

export function setup(app: NestExpressApplication) {
  app.enableCors({ origin: config.webUrls });
  app.enableShutdownHooks();
  return app;
}

// Vercel's NestJS entrypoint pattern: a bootstrap() call rather than top-level await, which its bundler may not support
async function bootstrap() {
  const app = setup(await NestFactory.create<NestExpressApplication>(AppModule));
  await app.listen(config.port);
}

if (!process.env.VITEST) {
  bootstrap().catch((e) => {
    console.error('API failed to start:', e); // shows in Vercel's runtime logs
    process.exit(1);
  });
}
