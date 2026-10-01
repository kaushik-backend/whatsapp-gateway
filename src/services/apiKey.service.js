import { generateApiKey, hashApiKey } from '../utils/crypto.js';
import db from '../models/index.js';
import AppError from '../utils/AppError.js';

class ApiKeyService {
  /**
   * Create a new API Key
   */
  async create(name, scopes, sessionIds = [], chatJids = []) {
    const { raw: rawKey, hash: keyHash, prefix: keyPrefix } = generateApiKey();

    const apiKey = await db.ApiKey.create({
      name,
      keyHash,
      keyPrefix,
      scopes,
      sessionIds,
      chatJids,
      active: true,
    });

    // Return the raw key just once
    return {
      id: apiKey.id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      scopes: apiKey.scopes,
      sessionIds: apiKey.sessionIds,
      chatJids: apiKey.chatJids,
      active: apiKey.active,
      rawKey,
    };
  }

  /**
   * Validate a raw API key
   */
  async validate(rawKey) {
    if (!rawKey) {
      throw new AppError('API key is required', 401);
    }

    const keyHash = hashApiKey(rawKey);
    const apiKey = await db.ApiKey.findOne({ where: { keyHash } });

    if (!apiKey || !apiKey.active) {
      throw new AppError('Invalid API key', 401);
    }

    return apiKey;
  }

  /**
   * Check if the API key has the required scope
   */
  checkScope(apiKey, requiredScope) {
    if (!apiKey.scopes || !apiKey.scopes.includes(requiredScope)) {
      throw new AppError('Insufficient scope', 403);
    }
  }

  /**
   * Check if the API key is authorized for the given session ID
   */
  checkSession(apiKey, sessionId) {
    if (apiKey.sessionIds && apiKey.sessionIds.length > 0 && !apiKey.sessionIds.includes(sessionId)) {
      throw new AppError('Not authorized for this session', 403);
    }
  }

  /**
   * Check if the API key is authorized for the given chat JID
   */
  checkChat(apiKey, chatJid) {
    if (apiKey.chatJids && apiKey.chatJids.length > 0 && !apiKey.chatJids.includes(chatJid)) {
      throw new AppError('Not authorized for this chat', 403);
    }
  }

  /**
   * List all API keys
   */
  async list() {
    return await db.ApiKey.findAll({
      attributes: ['id', 'name', 'keyPrefix', 'scopes', 'sessionIds', 'chatJids', 'active'],
      order: [['id', 'DESC']],
    });
  }

  /**
   * Revoke an API key
   */
  async revoke(id) {
    const apiKey = await db.ApiKey.findByPk(id);
    if (!apiKey) {
      throw new AppError('API key not found', 404);
    }

    apiKey.active = false;
    await apiKey.save();

    return apiKey;
  }

  /**
   * Delete an API key completely
   */
  async delete(id) {
    const apiKey = await db.ApiKey.findByPk(id);
    if (!apiKey) {
      throw new AppError('API key not found', 404);
    }

    await apiKey.destroy();
    return true;
  }
}

export const apiKeyService = new ApiKeyService();
