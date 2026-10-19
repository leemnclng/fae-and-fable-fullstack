import type { NestExpressApplication } from '@nestjs/platform-express';
import { config } from './config.js';

/** App-wide wiring shared by main.ts and the e2e tests. Kept out of main.ts: Vercel rejects an entrypoint that exports anything. */
export function setup(app: NestExpressApplication) {
  app.enableCors({ origin: config.webUrls });
  app.enableShutdownHooks();
  return app;
}
