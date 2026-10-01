import { Sequelize } from 'sequelize';
import config from './index.js';
import logger from '../utils/logger.js';

const isProduction = config.nodeEnv === 'production';

// Only use SSL for external Render URLs (.render.com).
// Internal Render URLs (dpg-xxx hostnames) do NOT need/support SSL.
const dbUrl = config.database.url || '';
const needsSSL = isProduction && dbUrl.includes('.render.com');

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
