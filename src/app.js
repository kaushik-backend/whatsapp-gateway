import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import config from './config/index.js';
import rateLimiter from './middleware/rateLimiter.middleware.js';
import AppError from './utils/AppError.js';
import routes from './routes/index.js';
import logger from './utils/logger.js';

import path from 'path';

const app = express();

// Global Middlewares
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(cors({ origin: config.cors.origin }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(rateLimiter);

// Static uploads directory for media files (voice, images, docs)
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

// API Routes
app.use('/api/v1', routes);

// Serve Frontend (Vite React Build) if present
const clientDistPath = path.resolve(process.cwd(), 'client', 'dist');
import('fs').then((fs) => {
  if (fs.existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
        return next();
      }
      res.sendFile(path.join(clientDistPath, 'index.html'));
    });
  }
});

// 404 Handler for API routes
app.use((req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});


// Global Error Handler
app.use((err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  let error = { ...err };
  error.message = err.message;
  error.name = err.name;

  // Sequelize Validation Error
  if (err.name === 'SequelizeValidationError' || err.name === 'SequelizeUniqueConstraintError') {
    error.statusCode = 400;
    error.message = err.errors.map((e) => e.message).join(', ');
  }
  
  if (config.nodeEnv === 'development') {
    logger.error(`Error: ${error.message}\nStack: ${err.stack}`);
    return res.status(error.statusCode).json({
      success: false,
      status: error.status,
      message: error.message,
      stack: err.stack,
      error: err
    });
  }

  logger.error(`Error: ${error.message}`);
  
  if (err.isOperational || error.statusCode === 400) {
    return res.status(error.statusCode).json({
      success: false,
      status: error.status,
      message: error.message
    });
  }
  
  // Unknown errors in production
  res.status(500).json({
    success: false,
    status: 'error',
    message: 'Something went very wrong!'
  });
});

export default app;
