import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { config } from './config.js';
import { setup } from './setup.js';

// Vercel's NestJS entrypoint pattern: no exports and a bootstrap() call; Vercel serves whatever app.listen starts
async function bootstrap() {
  const app = setup(await NestFactory.create<NestExpressApplication>(AppModule));
  await app.listen(config.port);
}

bootstrap().catch((e) => {
  console.error('API failed to start:', e); // shows in Vercel's runtime logs
  process.exit(1);
});
