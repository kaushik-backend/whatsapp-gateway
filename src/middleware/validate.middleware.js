import AppError from '../utils/AppError.js';

export const validate = (schema) => (req, res, next) => {
  try {
    if (schema.params) {
      const parsedParams = schema.params.parse(req.params);
      try {
        req.params = parsedParams;
      } catch (e) {
        Object.assign(req.params, parsedParams);
      }
    }
    if (schema.query) {
      const parsedQuery = schema.query.parse(req.query);
      try {
        req.query = parsedQuery;
      } catch (e) {
        Object.defineProperty(req, 'query', {
          value: parsedQuery,
          writable: true,
          configurable: true
        });
      }
    }
    if (schema.body) {
      req.body = schema.body.parse(req.body);
    }
    next();
  } catch (error) {
    if (error.name === 'ZodError') {
      const messages = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      return next(new AppError(`Validation Error: ${messages}`, 400));
    }
    next(error);
  }
};

export default validate;
