import catchAsync from '../utils/catchAsync.js';
import SuccessResponse from '../utils/SuccessResponse.js';
import messageService from '../services/message.service.js';

export const sendText = catchAsync(async (req, res) => {
  const { sessionId } = req.params;
  const { to, text, idempotencyKey } = req.body;
  const message = await messageService.sendText(sessionId, to, text, idempotencyKey);
  new SuccessResponse({ statusCode: 202, data: { id: message.id, status: message.status }, message: 'Message queued for sending' }).send(res);
});

export const sendImage = catchAsync(async (req, res) => {
  const { sessionId } = req.params;
  const { to, url, caption, idempotencyKey } = req.body;
  const message = await messageService.sendImage(sessionId, to, url, caption, idempotencyKey);
  new SuccessResponse({ statusCode: 202, data: { id: message.id, status: message.status }, message: 'Image message queued' }).send(res);
});

export const sendDocument = catchAsync(async (req, res) => {
  const { sessionId } = req.params;
  const { to, url, filename, mimetype, idempotencyKey } = req.body;
  const message = await messageService.sendDocument(sessionId, to, url, filename, mimetype, idempotencyKey);
  new SuccessResponse({ statusCode: 202, data: { id: message.id, status: message.status }, message: 'Document message queued' }).send(res);
});

export const sendVoice = catchAsync(async (req, res) => {
  const { sessionId } = req.params;
  const { to, url, text, idempotencyKey } = req.body;
  const message = await messageService.sendVoice(sessionId, to, url, text, idempotencyKey);
  new SuccessResponse({ statusCode: 202, data: { id: message.id, status: message.status }, message: 'Voice message queued' }).send(res);
});

export const sendVoiceSynthesize = catchAsync(async (req, res) => {
  const { sessionId } = req.params;
  const { to, text, lang = 'en', idempotencyKey } = req.body;
  if (!text || !text.trim()) {
    throw new AppError('Text is required to synthesize voice message', 400);
  }
  const { voiceService } = await import('../services/voice.service.js');
  const voiceResult = await voiceService.synthesizeVoice({ text, lang });
  const message = await messageService.sendVoice(sessionId, to, voiceResult.url, text, idempotencyKey);
  new SuccessResponse({
    statusCode: 202,
    data: {
      id: message.id,
      status: message.status,
      url: voiceResult.url,
      text: voiceResult.text,
      size: voiceResult.size
    },
    message: 'Voice message synthesized and queued'
  }).send(res);
});

export const getVoiceConfig = catchAsync(async (req, res) => {
  const { aiBotService } = await import('../services/aiBot.service.js');
  new SuccessResponse({
    data: {
      voiceReplyMode: aiBotService.getVoiceReplyMode(),
      availableModes: ['auto', 'always', 'never'],
      ttsEngine: 'google-tts',
      sttEngine: 'gemini-multimodal'
    },
    message: 'Voice configuration retrieved'
  }).send(res);
});

export const updateVoiceConfig = catchAsync(async (req, res) => {
  const { mode } = req.body;
  const { aiBotService } = await import('../services/aiBot.service.js');
  aiBotService.setVoiceReplyMode(mode);
  new SuccessResponse({
    data: { voiceReplyMode: aiBotService.getVoiceReplyMode() },
    message: `Voice reply mode updated to ${mode}`
  }).send(res);
});

export const sendReaction = catchAsync(async (req, res) => {
  const { sessionId } = req.params;
  const { to, waMessageId, emoji } = req.body;
  const message = await messageService.sendReaction(sessionId, to, waMessageId, emoji);
  new SuccessResponse({ statusCode: 202, data: { id: message.id, status: message.status }, message: 'Reaction queued' }).send(res);
});

export const getMessage = catchAsync(async (req, res) => {
  const { messageId } = req.params;
  const message = await messageService.getById(messageId);
  new SuccessResponse({ data: message, message: 'Message retrieved' }).send(res);
});

export const listMessages = catchAsync(async (req, res) => {
  const { sessionId } = req.params;
  const { chatJid, limit, offset } = req.query;
  const messages = await messageService.getBySession(sessionId, { chatJid, limit, offset });
  new SuccessResponse({ data: messages, message: 'Messages retrieved' }).send(res);
});

export const getChatContext = catchAsync(async (req, res) => {
  const { sessionId } = req.params;
  const { chatJid, limit } = req.query;
  const messages = await messageService.getChatContext(sessionId, chatJid, limit);
  new SuccessResponse({ data: messages, message: 'Chat context retrieved' }).send(res);
});

export const sendVoiceUpload = catchAsync(async (req, res) => {
  const { sessionId } = req.params;
  const { to, idempotencyKey } = req.body;
  if (!req.file) {
    throw new AppError('Audio file is required', 400);
  }
  const url = `/uploads/${req.file.filename}`;
  const message = await messageService.sendVoice(sessionId, to, url, idempotencyKey);
  new SuccessResponse({ statusCode: 202, data: { id: message.id, status: message.status, url }, message: 'Voice message uploaded and queued' }).send(res);
});

export const sendImageUpload = catchAsync(async (req, res) => {
  const { sessionId } = req.params;
  const { to, caption, idempotencyKey } = req.body;
  if (!req.file) {
    throw new AppError('Image file is required', 400);
  }
  const url = `/uploads/${req.file.filename}`;
  const message = await messageService.sendImage(sessionId, to, url, caption || '', idempotencyKey);
  new SuccessResponse({ statusCode: 202, data: { id: message.id, status: message.status, url }, message: 'Image uploaded and queued' }).send(res);
});

export const sendDocumentUpload = catchAsync(async (req, res) => {
  const { sessionId } = req.params;
  const { to, idempotencyKey } = req.body;
  if (!req.file) {
    throw new AppError('Document file is required', 400);
  }
  const url = `/uploads/${req.file.filename}`;
  const filename = req.file.originalname;
  const mimetype = req.file.mimetype;
  const message = await messageService.sendDocument(sessionId, to, url, filename, mimetype, idempotencyKey);
  new SuccessResponse({ statusCode: 202, data: { id: message.id, status: message.status, url, filename }, message: 'Document uploaded and queued' }).send(res);
});
