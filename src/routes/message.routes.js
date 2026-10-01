import { Router } from 'express';
import * as messageController from '../controllers/message.controller.js';
import { validate } from '../middleware/validate.middleware.js';
import * as validator from '../validators/message.validator.js';

import upload from '../middleware/upload.middleware.js';

const router = Router({ mergeParams: true });

router.post('/text', validate(validator.sendTextSchema), messageController.sendText);
router.post('/image', validate(validator.sendImageSchema), messageController.sendImage);
router.post('/image/upload', upload.single('file'), messageController.sendImageUpload);
router.post('/document', validate(validator.sendDocumentSchema), messageController.sendDocument);
router.post('/document/upload', upload.single('file'), messageController.sendDocumentUpload);
router.post('/voice', validate(validator.sendVoiceSchema), messageController.sendVoice);
router.post('/voice/upload', upload.single('file'), messageController.sendVoiceUpload);
router.post('/voice/synthesize', validate(validator.sendVoiceSynthesizeSchema), messageController.sendVoiceSynthesize);
router.get('/voice/config', messageController.getVoiceConfig);
router.put('/voice/config', messageController.updateVoiceConfig);
router.post('/react', validate(validator.sendReactionSchema), messageController.sendReaction);

router.get('/:messageId', validate(validator.getMessageSchema), messageController.getMessage);
router.get('/', validate(validator.listMessagesSchema), messageController.listMessages);
router.get('/context/chat', validate(validator.listMessagesSchema), messageController.getChatContext);

export default router;
