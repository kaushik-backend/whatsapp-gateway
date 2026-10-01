import { z } from 'zod';

export const sendTextSchema = {
  params: z.object({
    sessionId: z.string()
  }),
  body: z.object({
    to: z.string().min(7).max(25),
    text: z.string().min(1).max(4096),
    idempotencyKey: z.string().max(255).optional()
  })
};

const mediaUrlSchema = z.string().min(1).refine(
  (val) => val.startsWith('http://') || val.startsWith('https://') || val.startsWith('/') || val.startsWith('uploads/'),
  { message: 'Must be a valid URL or uploaded path' }
);

export const sendImageSchema = {
  params: z.object({ sessionId: z.string() }),
  body: z.object({
    to: z.string().min(7).max(25),
    url: mediaUrlSchema,
    caption: z.string().max(1024).optional(),
    idempotencyKey: z.string().max(255).optional()
  })
};

export const sendDocumentSchema = {
  params: z.object({ sessionId: z.string() }),
  body: z.object({
    to: z.string().min(7).max(25),
    url: mediaUrlSchema,
    filename: z.string(),
    mimetype: z.string(),
    idempotencyKey: z.string().max(255).optional()
  })
};

export const sendVoiceSchema = {
  params: z.object({ sessionId: z.string() }),
  body: z.object({
    to: z.string().min(7).max(25),
    url: mediaUrlSchema,
    idempotencyKey: z.string().max(255).optional()
  })
};

export const sendVoiceSynthesizeSchema = {
  params: z.object({ sessionId: z.string() }),
  body: z.object({
    to: z.string().min(7).max(25),
    text: z.string().min(1).max(4096),
    lang: z.string().max(10).optional(),
    idempotencyKey: z.string().max(255).optional()
  })
};

export const sendReactionSchema = {
  params: z.object({ sessionId: z.string() }),
  body: z.object({
    to: z.string().min(7).max(25),
    waMessageId: z.string(),
    emoji: z.string().max(10)
  })
};

export const getMessageSchema = {
  params: z.object({
    messageId: z.coerce.number().int().positive()
  })
};

export const listMessagesSchema = {
  params: z.object({
    sessionId: z.string()
  }),
  query: z.object({
    chatJid: z.string().optional(),
    limit: z.coerce.number().default(50),
    offset: z.coerce.number().default(0)
  })
};
