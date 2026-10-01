import { Router } from 'express';
import * as webhookController from '../controllers/webhook.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import * as webhookValidator from '../validators/webhook.validator.js';

const router = Router();

router.post(
  '/',
  authenticate('admin'),
  validate(webhookValidator.registerSchema),
  webhookController.registerWebhook
);

router.get(
  '/',
  authenticate('read'),
  webhookController.listWebhooks
);

router.patch(
  '/:id',
  authenticate('admin'),
  validate(webhookValidator.updateSchema),
  webhookController.updateWebhook
);

router.delete(
  '/:id',
  authenticate('admin'),
  validate(webhookValidator.deleteSchema),
  webhookController.deleteWebhook
);

router.get(
  '/:id/deliveries',
  authenticate('read'),
  validate(webhookValidator.getDeliveriesSchema),
  webhookController.getDeliveries
);

router.post(
  '/deliveries/:deliveryId/retry',
  authenticate('admin'),
  validate(webhookValidator.retrySchema),
  webhookController.retryDelivery
);

export default router;
