import { z } from 'zod';

export const createSessionSchema = {
  body: z.object({
    id: z.string().min(1).max(50).regex(/^[a-zA-Z0-9_-]+$/, 'Invalid session ID format'),
    name: z.string().max(100).optional()
  })
};

export const getQRSchema = {
  params: z.object({
    id: z.string()
  }),
  query: z.object({
    format: z.enum(['png', 'json']).default('png')
  }).optional()
};

export const deleteSessionSchema = {
  params: z.object({
    id: z.string()
  })
};
