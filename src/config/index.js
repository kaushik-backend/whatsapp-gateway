import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.string().default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  CORS_ORIGIN: z.string().default('*'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  LOG_LEVEL: z.string().default('info'),
  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_MODEL: z.string().optional().default('gemini-flash-lite-latest')
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('Invalid environment variables:\n', JSON.stringify(_env.error.format(), null, 2));
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
