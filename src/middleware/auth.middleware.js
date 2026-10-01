import { apiKeyService } from '../services/apiKey.service.js';
import AppError from '../utils/AppError.js';
import catchAsync from '../utils/catchAsync.js';

/**
 * Middleware to authenticate API keys
 * @param {string} [requiredScope] - Optional required scope for the route
 */
export const authenticate = (requiredScope) => {
  return catchAsync(async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.query.api_key) {
      token = req.query.api_key;
    }

    if (!token) {
      return next(new AppError('You are not logged in! Please provide an API key.', 401));
    }

    // Validate the API key
    const apiKey = await apiKeyService.validate(token);

    // Check scope if required
    if (requiredScope) {
      apiKeyService.checkScope(apiKey, requiredScope);
    }

    // Check session authorization if sessionId is in params
    if (req.params.sessionId) {
      apiKeyService.checkSession(apiKey, req.params.sessionId);
    }
    
    // Check session authorization if sessionId is in body
    if (req.body && req.body.sessionId) {
      apiKeyService.checkSession(apiKey, req.body.sessionId);
    }

    // Attach apiKey to request
    req.apiKey = apiKey;

    next();
  });
};

/**
 * Optional authentication middleware - does not throw if no token is provided
 * Useful for public endpoints like QR code generation
 */
export const optionalAuth = () => {
  return catchAsync(async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.query.api_key) {
      token = req.query.api_key;
    }

    if (!token) {
      return next(); // Proceed without req.apiKey
    }

    try {
      // Validate the API key
      const apiKey = await apiKeyService.validate(token);
      req.apiKey = apiKey;
    } catch (error) {
      // Ignore errors for optional auth, just don't attach apiKey
    }

    next();
  });
};
