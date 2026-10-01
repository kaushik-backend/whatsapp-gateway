import crypto from 'crypto';

export const generateApiKey = () => {
  const raw = crypto.randomBytes(32).toString('hex');
  const prefix = raw.substring(0, 12);
  const hash = hashApiKey(raw);
  return { raw, hash, prefix };
};

export const hashApiKey = (raw) => {
  return crypto.createHash('sha256').update(raw).digest('hex');
};

export const signPayload = (secret, payload) => {
  const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
};

export const verifySignature = (secret, payload, signature) => {
  const expectedSignature = signPayload(secret, payload);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(signature)
    );
  } catch (e) {
    return false;
  }
};
