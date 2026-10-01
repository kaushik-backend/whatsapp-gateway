require('dotenv').config();

const parseDatabaseUrl = (url) => {
  if (!url) return {};
  try {
    const parsed = new URL(url);
    return {
      username: parsed.username,
      password: parsed.password,
      database: parsed.pathname.replace(/^\//, ''),
      host: parsed.hostname,
      port: parsed.port || 5432,
      dialect: 'postgres'
    };
  } catch (err) {
    return { url };
  }
};

const dbConfig = process.env.DATABASE_URL
  ? { url: process.env.DATABASE_URL, dialect: 'postgres', ...parseDatabaseUrl(process.env.DATABASE_URL) }
  : {
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'whatsapp_gateway',
      host: process.env.DB_HOST || '127.0.0.1',
      port: process.env.DB_PORT || 5432,
      dialect: 'postgres'
    };

module.exports = {
  development: {
    ...dbConfig
  },
  test: {
    ...dbConfig
  },
  production: {
    ...dbConfig,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    }
  }
};
