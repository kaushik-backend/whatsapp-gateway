import { Router } from 'express';
import * as apiKeyController from '../controllers/apiKey.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import * as apiKeyValidator from '../validators/apiKey.validator.js';

import db from '../models/index.js';
import catchAsync from '../utils/catchAsync.js';

const router = Router();

// Middleware: allow unauthenticated creation ONLY if no active keys exist yet (bootstrap)
const bootstrapOrAdmin = catchAsync(async (req, res, next) => {
  const count = await db.ApiKey.count({ where: { active: true } });
  if (count === 0) {
    return next();
  }
  return authenticate('admin')(req, res, next);
});

router.post(
  '/',
  bootstrapOrAdmin,
  validate(apiKeyValidator.createKeySchema),
  apiKeyController.createKey
);

router.use(authenticate('admin'));

router.get(
  '/',
  apiKeyController.listKeys
);

router.patch(
  '/:id/revoke',
  validate(apiKeyValidator.revokeKeySchema),
  apiKeyController.revokeKey
);

router.delete(
  '/:id',
  validate(apiKeyValidator.deleteKeySchema),
  apiKeyController.deleteKey
);

export default router;
