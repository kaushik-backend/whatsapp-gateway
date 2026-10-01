import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3000').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url(),
  CORS_ORIGIN: z.string().default('*'),
  RATE_LIMIT_WINDOW_MS: z.string().default('60000').transform(Number),
  RATE_LIMIT_MAX: z.string().default('100').transform(Number),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_MODEL: z.string().optional().default('gemini-flash-latest')
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('Invalid environment variables:\n', _env.error.format());
  process.exit(1);
}

const config = {
  port: _env.data.PORT,
  nodeEnv: _env.data.NODE_ENV,
  database: {
    url: _env.data.DATABASE_URL
  },
  cors: {
    origin: _env.data.CORS_ORIGIN
  },
  rateLimit: {
    windowMs: _env.data.RATE_LIMIT_WINDOW_MS,
    max: _env.data.RATE_LIMIT_MAX
  },
  logLevel: _env.data.LOG_LEVEL,
  gemini: {
    apiKey: _env.data.GEMINI_API_KEY,
    model: _env.data.GEMINI_MODEL
  }
};

export default config;
