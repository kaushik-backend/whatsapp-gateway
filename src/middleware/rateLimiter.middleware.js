import rateLimit from 'express-rate-limit';
import config from '../config/index.js';

export const createLimiter = (options = {}) => {
  return rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    message: {
      success: false,
      message: 'Too many requests, please try again later.'
    },
    ...options
  });
};

const defaultLimiter = createLimiter();

export default defaultLimiter;
