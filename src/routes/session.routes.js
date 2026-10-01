import { Router } from 'express';
import {
  createSession,
  listSessions,
  getSessionQR,
  deleteSession,
  simulateIncoming,
  getSessionPrivacy,
  updateSessionPrivacy,
  addAllowedPrivacyContact,
  removeAllowedPrivacyContact,
  getAntiBanStatus,
  updateAntiBanMode
} from '../controllers/session.controller.js';
import validate from '../middleware/validate.middleware.js';
import { createSessionSchema, getQRSchema, deleteSessionSchema } from '../validators/session.validator.js';

const router = Router();

router.post('/', validate(createSessionSchema), createSession);
router.get('/', listSessions);
router.get('/:id/qr', validate(getQRSchema), getSessionQR);
router.delete('/:id', validate(deleteSessionSchema), deleteSession);
router.post('/:id/simulate/incoming', simulateIncoming);

// Privacy & Isolation Whitelist Controls
router.get('/:id/privacy', getSessionPrivacy);
router.put('/:id/privacy', updateSessionPrivacy);
router.post('/:id/privacy/allow', addAllowedPrivacyContact);
router.post('/:id/privacy/remove', removeAllowedPrivacyContact);

// Anti-Ban & Pacing Controls
router.get('/:id/antiban', getAntiBanStatus);
router.put('/:id/antiban', updateAntiBanMode);

export default router;


