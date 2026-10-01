import logger from '../utils/logger.js';
import db from '../models/index.js';

class PrivacyFilterService {
  constructor() {
    this.sessionConfigs = new Map();
    this.activeGatewayContacts = new Map(); // sessionId -> Set(chatJid)

    // Load initial global defaults from environment
    const envAllowed = process.env.ALLOWED_CONTACTS
      ? process.env.ALLOWED_CONTACTS.split(',').map((c) => this._normalizeJid(c.trim())).filter(Boolean)
      : [];

    const defaultMode = process.env.PRIVACY_MODE || 'all';

    this.defaultConfig = {
      mode: defaultMode, // 'all' allows all contacts by default
      allowedContacts: new Set(envAllowed),
      ignoreGroups: true,
      ignoreBroadcasts: true
    };

  }

  _normalizeJid(to) {
    if (!to || typeof to !== 'string') return '';
    const trimmed = to.trim();
    if (trimmed.endsWith('@s.whatsapp.net') || trimmed.endsWith('@lid') || trimmed.endsWith('@g.us')) {
      return trimmed;
    }
    const cleanNumber = trimmed.replace(/[^0-9]/g, '');
    if (!cleanNumber) return '';
    return `${cleanNumber}@s.whatsapp.net`;
  }

  _cleanNumber(jid) {
    if (!jid) return '';
    return jid.split('@')[0].replace(/[^0-9]/g, '');
  }

  /**
   * Get or initialize session privacy configuration
   */
  getConfig(sessionId) {
    if (!this.sessionConfigs.has(sessionId)) {
      this.sessionConfigs.set(sessionId, {
        mode: this.defaultConfig.mode,
        allowedContacts: new Set(this.defaultConfig.allowedContacts),
        ignoreGroups: this.defaultConfig.ignoreGroups,
        ignoreBroadcasts: this.defaultConfig.ignoreBroadcasts
      });
    }

    const conf = this.sessionConfigs.get(sessionId);
    return {
      sessionId,
      mode: conf.mode,
      allowedContacts: Array.from(conf.allowedContacts),
      ignoreGroups: conf.ignoreGroups,
      ignoreBroadcasts: conf.ignoreBroadcasts
    };
  }

  /**
   * Update session privacy configuration
   */
  updateConfig(sessionId, { mode, allowedContacts, ignoreGroups, ignoreBroadcasts }) {
    const current = this.sessionConfigs.get(sessionId) || {
      mode: this.defaultConfig.mode,
      allowedContacts: new Set(this.defaultConfig.allowedContacts),
      ignoreGroups: this.defaultConfig.ignoreGroups,
      ignoreBroadcasts: this.defaultConfig.ignoreBroadcasts
    };

    if (mode && ['target_only', 'gateway_only', 'all'].includes(mode)) {
      current.mode = mode;
    }

    if (Array.isArray(allowedContacts)) {
      current.allowedContacts = new Set(allowedContacts.map((c) => this._normalizeJid(c)).filter(Boolean));
    }

    if (ignoreGroups !== undefined) current.ignoreGroups = Boolean(ignoreGroups);
    if (ignoreBroadcasts !== undefined) current.ignoreBroadcasts = Boolean(ignoreBroadcasts);

    this.sessionConfigs.set(sessionId, current);
    logger.info(`[PrivacyFilter] Session [${sessionId}] privacy config updated: mode=${current.mode}, allowedContacts=${current.allowedContacts.size}`);

    return this.getConfig(sessionId);
  }

  /**
   * Add a single allowed contact to whitelist
   */
  addAllowedContact(sessionId, contact) {
    const jid = this._normalizeJid(contact);
    if (!jid) return this.getConfig(sessionId);

    const conf = this.sessionConfigs.get(sessionId) || {
      mode: 'target_only',
      allowedContacts: new Set(this.defaultConfig.allowedContacts),
      ignoreGroups: true,
      ignoreBroadcasts: true
    };

    conf.allowedContacts.add(jid);
    // If adding first contact, ensure mode is target_only
    if (conf.mode === 'all') conf.mode = 'target_only';

    this.sessionConfigs.set(sessionId, conf);
    logger.info(`[PrivacyFilter] Added ${jid} to allowed contacts for session [${sessionId}]`);

    return this.getConfig(sessionId);
  }

  /**
   * Remove an allowed contact from whitelist
   */
  removeAllowedContact(sessionId, contact) {
    const jid = this._normalizeJid(contact);
    const conf = this.sessionConfigs.get(sessionId);
    if (conf && jid) {
      conf.allowedContacts.delete(jid);
    }
    return this.getConfig(sessionId);
  }

  /**
   * Record when the gateway/admin initiates or sends a message to a contact
   */
  recordGatewayContact(sessionId, chatJid) {
    const normalized = this._normalizeJid(chatJid);
    if (!normalized) return;

    if (!this.activeGatewayContacts.has(sessionId)) {
      this.activeGatewayContacts.set(sessionId, new Set());
    }
    this.activeGatewayContacts.get(sessionId).add(normalized);
  }

  /**
   * Core Privacy Decision Engine:
   * Returns true if message should be saved and shown to admin; false if message from personal contact list is to be hidden/dropped.
   */
  async shouldCaptureMessage({ sessionId, remoteJid, fromMe }) {
    if (!remoteJid) return false;

    const conf = this.getConfig(sessionId);

    // 1. Never capture status broadcasts or newsletter channels
    if (remoteJid.endsWith('@broadcast') || remoteJid.includes('broadcast') || remoteJid.endsWith('@newsletter')) {
      return false;
    }

    // 2. Ignore group chats if groups are filtered (default true)
    if (conf.ignoreGroups && remoteJid.endsWith('@g.us')) {
      logger.debug(`[PrivacyFilter] Ignored group message from ${remoteJid}`);
      return false;
    }

    // 3. Outgoing messages from admin/gateway are always captured and register the contact
    if (fromMe) {
      this.recordGatewayContact(sessionId, remoteJid);
      return true;
    }

    // 4. Mode: 'all' (no contact filtering)
    if (conf.mode === 'all') {
      return true;
    }

    const cleanRemote = this._cleanNumber(remoteJid);

    // 5. Mode: 'target_only' (Strict Whitelist - only show messages from designated contact(s))
    if (conf.mode === 'target_only') {
      // 1. Check if this contact / LID was contacted by the gateway
      const hasActiveGateway = this.activeGatewayContacts.get(sessionId)?.has(remoteJid);
      if (hasActiveGateway) return true;

      // 2. Check if clean number or JID matches whitelist
      const isWhitelisted = conf.allowedContacts.some((allowed) => {
        const cleanAllowed = this._cleanNumber(allowed);
        return cleanAllowed === cleanRemote || allowed === remoteJid;
      });
      if (isWhitelisted) return true;

      // 3. Also check if gateway has sent an outgoing message to this contact in DB
      try {
        const count = await db.Message.count({ where: { sessionId, chatJid: remoteJid, fromMe: true } });
        if (count > 0) {
          this.recordGatewayContact(sessionId, remoteJid);
          return true;
        }
      } catch (e) {}

      logger.info(`[PrivacyFilter] Dropped message from non-whitelisted personal contact: ${remoteJid}`);
      return false;
    }


    // 6. Mode: 'gateway_only' (Only allow conversations initiated with/by the gateway/admin)
    if (conf.mode === 'gateway_only') {
      // Check in-memory active contacts
      const hasInMemory = this.activeGatewayContacts.get(sessionId)?.has(remoteJid);
      if (hasInMemory) return true;

      // Check if this contact is in whitelist
      const isWhitelisted = conf.allowedContacts.some((allowed) => {
        const cleanAllowed = this._cleanNumber(allowed);
        return cleanAllowed === cleanRemote || allowed === remoteJid;
      });
      if (isWhitelisted) return true;

      // Check if gateway has ever sent a message to this contact in PostgreSQL
      try {
        const priorSendCount = await db.Message.count({
          where: {
            sessionId,
            chatJid: remoteJid,
            fromMe: true
          }
        });

        if (priorSendCount > 0) {
          this.recordGatewayContact(sessionId, remoteJid);
          return true;
        }
      } catch (err) {
        logger.warn(`[PrivacyFilter] DB check error: ${err.message}`);
      }

      logger.info(`[PrivacyFilter] Dropped unassociated personal contact chat from ${remoteJid}`);
      return false;
    }

    return true;
  }
}

export const privacyFilterService = new PrivacyFilterService();
export default privacyFilterService;
