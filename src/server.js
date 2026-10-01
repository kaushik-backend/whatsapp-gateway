// Top-level bootstrap wrapper — catches ANY crash during module loading
console.log('[BOOT] server.js loading...');

let app, db, logger, config;

try {
  const appModule = await import('./app.js');
  app = appModule.default;

  const dbModule = await import('./models/index.js');
  db = dbModule.default;

  const loggerModule = await import('./utils/logger.js');
  logger = loggerModule.default;

  const configModule = await import('./config/index.js');
  config = configModule.default;
} catch (bootError) {
  console.error('[BOOT FATAL] Failed to load modules:', bootError.message);
  console.error(bootError.stack);
  process.exit(1);
}

console.log('[BOOT] All modules loaded. Starting server...');

let server;

const startServer = async () => {
  try {
    // Authenticate and sync DB
    await db.sequelize.authenticate();
    logger.info('Database connected successfully.');

    // If DB_SYNC is true, run sync (migrations are the primary method)
    if (process.env.DB_SYNC === 'true') {
      await db.sequelize.sync();
      logger.info('Database models synced.');
    }

    // Try to restore sessions if service exists
    try {
      const { default: sessionService } = await import('./services/session.service.js');
      if (sessionService && sessionService.restore) {
        logger.info('Restoring WhatsApp sessions...');
        await sessionService.restore();
      }
    } catch (err) {
      logger.warn(`Could not restore sessions: ${err.message}`);
    }

    // Auto-seed RAG Knowledge Base if empty
    try {
      const { ragService } = await import('./services/rag.service.js');
      if (ragService && ragService.autoSeedInitialDocs) {
        ragService.autoSeedInitialDocs().catch((err) => {
          logger.warn(`Could not auto-seed knowledge base: ${err.message}`);
        });
      }
    } catch (err) {
      logger.warn(`Could not initialize RAG service: ${err.message}`);
    }

    server = app.listen(config.port, () => {
      logger.info(`Server running on port ${config.port} in ${config.nodeEnv} mode.`);
    });
  } catch (error) {
    console.error(`[STARTUP FATAL] ${error.message}`);
    console.error(error.stack);
    if (logger) logger.error(`Failed to start server: ${error.message}\n${error.stack}`);
    process.exit(1);
  }
};


const exitHandler = () => {
  if (server) {
    server.close(() => {
      if (logger) logger.info('Server closed.');
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
};

const unexpectedErrorHandler = (error) => {
  const msg = error?.message || '';
  if (
    msg.includes('Connection Closed') ||
    msg.includes('Bad MAC') ||
    msg.includes('rate-overlimit') ||
    msg.includes('Timed Out') ||
    msg.includes('QR refs')
  ) {
    if (logger) logger.warn(`[Baileys/Socket Transient] ${msg}`);
    return;
  }
  if (logger) logger.error(`Unexpected Error: ${error.message}\n${error.stack}`);
  else console.error(`Unexpected Error: ${error.message}\n${error.stack}`);
};

process.on('uncaughtException', (err) => {
  const msg = err?.message || '';
  if (
    msg.includes('Connection Closed') ||
    msg.includes('Bad MAC') ||
    msg.includes('rate-overlimit')
  ) {
    if (logger) logger.warn(`[Baileys/Socket Uncaught] ${msg}`);
    return;
  }
  unexpectedErrorHandler(err);
});

process.on('unhandledRejection', unexpectedErrorHandler);


process.on('SIGTERM', () => {
  if (logger) logger.info('SIGTERM received.');
  if (server) {
    server.close();
  }
});

startServer();
