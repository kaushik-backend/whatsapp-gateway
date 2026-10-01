import { z } from 'zod';

export const registerSchema = {
  body: z.object({
    sessionId: z.string(),
    url: z.string().url(),
    secret: z.string().min(16).max(256),
    events: z.array(z.enum(['message.received', 'message.status', 'session.status', 'reaction'])).min(1),
    chatJids: z.array(z.string()).default([]),
  }),
};

export const updateSchema = {
  params: z.object({
    id: z.coerce.number(),
  }),
  body: z.object({
    url: z.string().url().optional(),
    events: z.array(z.enum(['message.received', 'message.status', 'session.status', 'reaction'])).optional(),
    chatJids: z.array(z.string()).optional(),
    active: z.boolean().optional(),
  }).strict(),
};

export const deleteSchema = {
  params: z.object({
    id: z.coerce.number(),
  }),
};

export const getDeliveriesSchema = {
  params: z.object({
    id: z.coerce.number(),
  }),
  query: z.object({
    status: z.enum(['pending', 'delivered', 'failed', 'dead']).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  }).partial(),
};

export const retrySchema = {
  params: z.object({
    deliveryId: z.coerce.number(),
  }),
};
