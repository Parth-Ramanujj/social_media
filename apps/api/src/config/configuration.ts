import type { Platform } from '@pulse/shared-types';

export interface AppConfig {
  nodeEnv: string;
  appUrl: string;
  frontendUrl: string;
  apiPort: number;
  databaseUrl: string;
  redisUrl: string;
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  accessTokenTtl: number;
  refreshTokenTtl: number;
  tokenEncryptionKey: string;
  smtp: { host: string; port: number; user: string; pass: string; from: string };
  s3: {
    endpoint: string;
    region: string;
    bucket: string;
    accessKey: string;
    secretKey: string;
    forcePathStyle: boolean;
  };
  platformEnabled: Record<Platform, boolean>;
}

export function configuration(): AppConfig {
  const requireSecret = (name: string, value: string | undefined, forbidden: string[]) => {
    if (!value) {
      throw new Error(`Missing required env var ${name}`);
    }
    if (process.env.NODE_ENV === 'production' && forbidden.includes(value)) {
      throw new Error(`Env var ${name} still uses the development default; set a real secret in production`);
    }
    return value;
  };

  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    appUrl: process.env.APP_URL ?? 'http://localhost:4000',
    frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    apiPort: Number(process.env.API_PORT ?? 4000),
    databaseUrl: requireSecret('DATABASE_URL', process.env.DATABASE_URL, []),
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
    jwtAccessSecret: requireSecret('JWT_ACCESS_SECRET', process.env.JWT_ACCESS_SECRET, ['change-me-access']),
    jwtRefreshSecret: requireSecret('JWT_REFRESH_SECRET', process.env.JWT_REFRESH_SECRET, ['change-me-refresh']),
    accessTokenTtl: Number(process.env.ACCESS_TOKEN_TTL ?? 900),
    refreshTokenTtl: Number(process.env.REFRESH_TOKEN_TTL ?? 2592000),
    tokenEncryptionKey: requireSecret('TOKEN_ENCRYPTION_KEY', process.env.TOKEN_ENCRYPTION_KEY, [
      'change-me-base64-32-byte-key',
    ]),
    smtp: {
      host: process.env.SMTP_HOST ?? 'localhost',
      port: Number(process.env.SMTP_PORT ?? 1025),
      user: process.env.SMTP_USER ?? '',
      pass: process.env.SMTP_PASS ?? '',
      from: process.env.SMTP_FROM ?? 'Pulse <noreply@pulse.local>',
    },
    s3: {
      endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
      region: process.env.S3_REGION ?? 'us-east-1',
      bucket: process.env.S3_BUCKET ?? 'pulse-media',
      accessKey: process.env.S3_ACCESS_KEY ?? 'pulse',
      secretKey: process.env.S3_SECRET_KEY ?? 'pulse-minio-secret',
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    },
    platformEnabled: {
      meta: process.env.META_ENABLED === 'true',
      x: process.env.X_ENABLED === 'true',
      linkedin: process.env.LINKEDIN_ENABLED === 'true',
      youtube: process.env.YOUTUBE_ENABLED === 'true',
      pinterest: process.env.PINTEREST_ENABLED === 'true',
      tiktok: process.env.TIKTOK_ENABLED === 'true',
    },
  };
}