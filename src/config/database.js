import { Sequelize } from 'sequelize';
import config from './index.js';
import logger from '../utils/logger.js';

const dbUrl = config.database.url || '';

// Auto-detect SSL: enable for cloud DB providers or when sslmode=require is in URL.
// Skip SSL for localhost/local development.
const isLocal = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');
const needsSSL = !isLocal && (
  dbUrl.includes('sslmode=require') ||
  dbUrl.includes('.neon.tech') ||
  dbUrl.includes('.render.com') ||
  dbUrl.includes('.supabase.') ||
  config.nodeEnv === 'production'
);

const sequelize = new Sequelize(config.database.url, {
  dialect: 'postgres',
  logging: process.env.DB_LOGGING === 'true' ? (msg) => logger.debug(msg) : false,
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000
  },
  dialectOptions: needsSSL
    ? {
        ssl: {
          require: true,
          rejectUnauthorized: false
        }
      }
    : {}
});

export default sequelize;
