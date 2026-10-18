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

// Comma-separated so a preview deployment can be allowed next to production; the first one is used in generated links.
const webUrls = (process.env.WEB_URL ?? 'http://localhost:3000').split(',').map((u) => u.trim().replace(/\/$/, '')).filter(Boolean);

export const config = {
  port: Number(process.env.PORT ?? 4000),
  webUrl: webUrls[0],
  webUrls,
  jwtSecret: required('JWT_SECRET'),
  adminEmail: required('ADMIN_EMAIL'),
  adminPassword: required('ADMIN_PASSWORD'),
  databaseUrl: required('DATABASE_URL'),
  storage: {
    driver: process.env.STORAGE_DRIVER || 'supabase',
    supabaseUrl: process.env.SUPABASE_URL ?? '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    publicBucket: process.env.SUPABASE_PUBLIC_BUCKET || 'fae-fable-public',
    privateBucket: process.env.SUPABASE_PRIVATE_BUCKET || 'fae-fable-private',
    s3: {
      endpoint: process.env.S3_ENDPOINT ?? '',
      region: process.env.S3_REGION ?? '',
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
      publicBucket: process.env.S3_PUBLIC_BUCKET ?? '',
      privateBucket: process.env.S3_PRIVATE_BUCKET ?? '',
      publicUrl: process.env.S3_PUBLIC_URL ?? '',
    },
  },
  retentionDays: 15,
};

export type StorageConfig = typeof config.storage;
