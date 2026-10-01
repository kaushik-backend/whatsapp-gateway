import { z } from 'zod';

export const createKeySchema = {
  body: z.object({
    name: z.string().min(1).max(100),
    scopes: z.array(z.enum(['send', 'read', 'admin', 'voice'])).min(1),
    sessionIds: z.array(z.string()).default([]),
    chatJids: z.array(z.string()).default([]),
  }),
};

export const revokeKeySchema = {
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
};

export const deleteKeySchema = {
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
};
