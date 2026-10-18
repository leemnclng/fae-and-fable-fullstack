import { join } from 'node:path';

try {
  process.loadEnvFile();
} catch {
  // .env is optional; real env vars still apply
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

const dataDir = process.env.DATA_DIR ?? 'data';

export const config = {
  port: Number(process.env.PORT ?? 4000),
  webUrl: process.env.WEB_URL ?? 'http://localhost:3000',
  jwtSecret: required('JWT_SECRET'),
  adminEmail: required('ADMIN_EMAIL'),
  adminPassword: required('ADMIN_PASSWORD'),
  databaseUrl: required('DATABASE_URL'),
  dataDir,
  uploadsDir: join(dataDir, 'uploads'),
  retentionDays: 15,
};
