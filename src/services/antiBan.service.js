import logger from '../utils/logger.js';

class AntiBanService {
  constructor() {
    this.sessions = new Map();
    this.mode = process.env.ANTI_BAN_MODE || (process.env.WA_PROVIDER === 'mock' ? 'moderate' : 'strict');
    
    // Auto daily reset scheduled at midnight
    this._scheduleDailyReset();
  }

  getProfiles() {
    return {
      strict: {
        name: 'STRICT (Zero-Ban Risk)',
        maxPerMinute: 4,
        hardMinGapMs: 5000,
        sameRecipientCooldownMs: 10000,
        maxNewContactsPerHour: 6,
        burstThreshold: 10,
        burstPauseMinMs: 45000,
        burstPauseMaxMs: 90000,
        dailyCapStart: 25,
        dailyCapMax: 300,
        typingMsPerChar: [35, 75],
        minTypingMs: 2500,
        maxTypingMs: 9000,
        presenceDelayRangeMs: [1500, 3000],
        postSendGapRangeMs: [4000, 9000]
      },
      moderate: {
        name: 'MODERATE (Warmed-Up Numbers)',
        maxPerMinute: 8,
        hardMinGapMs: 3000,
        sameRecipientCooldownMs: 6000,
        maxNewContactsPerHour: 15,
        burstThreshold: 18,
        burstPauseMinMs: 25000,
        burstPauseMaxMs: 50000,
        dailyCapStart: 60,
        dailyCapMax: 800,
        typingMsPerChar: [25, 55],
        minTypingMs: 1500,
        maxTypingMs: 6000,
        presenceDelayRangeMs: [1000, 2000],
        postSendGapRangeMs: [2500, 6000]
      },
      relaxed: {
        name: 'RELAXED (Testing / Sandbox)',
        maxPerMinute: 30,
        hardMinGapMs: 500,
        sameRecipientCooldownMs: 1000,
        maxNewContactsPerHour: 100,
        burstThreshold: 50,
        burstPauseMinMs: 5000,
        burstPauseMaxMs: 10000,
        dailyCapStart: 1000,
        dailyCapMax: 5000,
        typingMsPerChar: [10, 20],
        minTypingMs: 500,
        maxTypingMs: 2000,
        presenceDelayRangeMs: [300, 600],
        postSendGapRangeMs: [500, 1500]
      }
    };
  }

  getActiveConfig() {
    const profiles = this.getProfiles();
    return profiles[this.mode] || profiles.strict;
  }

  setMode(mode) {
    if (['strict', 'moderate', 'relaxed'].includes(mode)) {
      this.mode = mode;
      logger.info(`[AntiBan] Mode switched to: ${mode.toUpperCase()}`);
    }
  }

  _getOrCreateSessionState(sessionId) {
    if (!this.sessions.has(sessionId)) {
      const cfg = this.getActiveConfig();
      this.sessions.set(sessionId, {
        minuteTimestamps: [],          // array of send timestamps within last 60s
        lastMessageTimestamp: 0,       // timestamp of last sent message
        recipientLastSent: new Map(),  // jid -> timestamp
        contactedThisHour: new Set(),  // jid set
        knownContacts: new Set(),      // all seen contacts
        hourStartedAt: Date.now(),
        newContactsThisHour: 0,
        burstCount: 0,
        dailySentCount: 0,
        warmupDay: 1,
        dailyLimit: cfg.dailyCapStart
      });
    }
    return this.sessions.get(sessionId);
  }

  /**
   * Hard rate limit evaluation before dispatching any queued job
   */
  canSend(sessionId, recipientJid) {
    const state = this._getOrCreateSessionState(sessionId);
    const cfg = this.getActiveConfig();
    const now = Date.now();

    // 1. Reset hourly window if elapsed
    if (now - state.hourStartedAt >= 3600000) {
      state.hourStartedAt = now;
      state.contactedThisHour.clear();
      state.newContactsThisHour = 0;
    }

    // 2. Clean rolling 60-second window
    state.minuteTimestamps = state.minuteTimestamps.filter((t) => now - t < 60000);

    // RULE 1: Hard Daily Limit (Warmup Protection)
    if (state.dailySentCount >= state.dailyLimit) {
      const msUntilMidnight = this._getMsUntilMidnight();
      logger.warn(`[AntiBan] Session ${sessionId} reached STRICT DAILY CAP of ${state.dailyLimit}. Pausing until midnight.`);
      return {
        allowed: false,
        retryAfterMs: Math.max(msUntilMidnight, 60000),
        reason: `Daily limit reached (${state.dailySentCount}/${state.dailyLimit} msgs today). Resets at midnight.`,
        code: 'DAILY_CAP_REACHED'
      };
    }

    // RULE 2: Hard Minimum Cooldown between any consecutive message
    const msSinceLast = now - state.lastMessageTimestamp;
    if (state.lastMessageTimestamp > 0 && msSinceLast < cfg.hardMinGapMs) {
      const waitMs = cfg.hardMinGapMs - msSinceLast;
      return {
        allowed: false,
        retryAfterMs: waitMs,
        reason: `Enforcing minimum inter-message gap of ${cfg.hardMinGapMs / 1000}s.`,
        code: 'MIN_GAP_COOLDOWN'
      };
    }

    // RULE 3: Same Recipient Flood Protection
    if (recipientJid && state.recipientLastSent.has(recipientJid)) {
      const msSinceRecipient = now - state.recipientLastSent.get(recipientJid);
      if (msSinceRecipient < cfg.sameRecipientCooldownMs) {
        const waitMs = cfg.sameRecipientCooldownMs - msSinceRecipient;
        return {
          allowed: false,
          retryAfterMs: waitMs,
          reason: `Recipient flood protection: waiting ${Math.ceil(waitMs / 1000)}s before messaging ${recipientJid} again.`,
          code: 'RECIPIENT_COOLDOWN'
        };
      }
    }

    // RULE 4: Strict Rolling Per-Minute Limit
    if (state.minuteTimestamps.length >= cfg.maxPerMinute) {
      const oldestInMinute = state.minuteTimestamps[0];
      const waitMs = 60000 - (now - oldestInMinute) + 500;
      logger.warn(`[AntiBan] Session ${sessionId} hit per-minute cap (${cfg.maxPerMinute}/min). Cooldown: ${Math.ceil(waitMs / 1000)}s.`);
      return {
        allowed: false,
        retryAfterMs: Math.max(waitMs, 2000),
        reason: `Per-minute rate limit (${cfg.maxPerMinute}/min) reached.`,
        code: 'PER_MINUTE_LIMIT'
      };
    }

    // RULE 5: Cold Messaging / New Contact Velocity Limiter
    if (recipientJid) {
      const isNewContact = !state.knownContacts.has(recipientJid);
      if (isNewContact && state.newContactsThisHour >= cfg.maxNewContactsPerHour) {
        const msRemainingInHour = 3600000 - (now - state.hourStartedAt);
        logger.warn(`[AntiBan] Session ${sessionId} hit new contact velocity (${state.newContactsThisHour}/${cfg.maxNewContactsPerHour} new contacts this hour).`);
        return {
          allowed: false,
          retryAfterMs: Math.max(msRemainingInHour, 60000),
          reason: `Cold messaging protection: max ${cfg.maxNewContactsPerHour} new contacts per hour reached.`,
          code: 'NEW_CONTACT_HOURLY_LIMIT'
        };
      }
    }

    // RULE 6: Natural Human Burst Pauses ("Coffee Break")
    if (state.burstCount >= cfg.burstThreshold) {
      const pauseDuration = Math.floor(
        Math.random() * (cfg.burstPauseMaxMs - cfg.burstPauseMinMs + 1)
      ) + cfg.burstPauseMinMs;
      
      logger.info(`[AntiBan] Session ${sessionId} completed a burst of ${state.burstCount} messages. Taking natural pause of ${Math.round(pauseDuration / 1000)}s.`);
      
      // Reset burst count so after pause it resumes naturally
      state.burstCount = 0;
      return {
        allowed: false,
        retryAfterMs: pauseDuration,
        reason: `Natural human break after sending ${cfg.burstThreshold} messages.`,
        code: 'BURST_PAUSE'
      };
    }

    return { allowed: true };
  }

  /**
   * Human-like typing delay calculation
   */
  getDelay(sessionId, messageLength = 20) {
    const cfg = this.getActiveConfig();

    // 1. Typing delay based on length + character rate
    const charsPerMs = Math.floor(
      Math.random() * (cfg.typingMsPerChar[1] - cfg.typingMsPerChar[0] + 1)
    ) + cfg.typingMsPerChar[0];
    
    let typingDelay = messageLength * charsPerMs;
    typingDelay = Math.max(cfg.minTypingMs, Math.min(typingDelay, cfg.maxTypingMs));

    // 2. Presence delay before typing starts
    const presenceDelay = Math.floor(
      Math.random() * (cfg.presenceDelayRangeMs[1] - cfg.presenceDelayRangeMs[0] + 1)
    ) + cfg.presenceDelayRangeMs[0];

    // 3. Post-send jitter gap delay
    const gapDelay = Math.floor(
      Math.random() * (cfg.postSendGapRangeMs[1] - cfg.postSendGapRangeMs[0] + 1)
    ) + cfg.postSendGapRangeMs[0];

    return {
      presenceDelay,
      typingDelay,
      gapDelay,
      total: presenceDelay + typingDelay + gapDelay
    };
  }

  /**
   * Record successful message dispatch
   */
  recordSend(sessionId, recipientJid) {
    const state = this._getOrCreateSessionState(sessionId);
    const now = Date.now();

    // Reset burst counter if there was a naturally long gap (> 3 mins)
    if (state.lastMessageTimestamp > 0 && now - state.lastMessageTimestamp > 180000) {
      state.burstCount = 0;
    }

    state.lastMessageTimestamp = now;
    state.minuteTimestamps.push(now);
    state.dailySentCount += 1;
    state.burstCount += 1;

    if (recipientJid) {
      state.recipientLastSent.set(recipientJid, now);

      if (!state.knownContacts.has(recipientJid)) {
        state.knownContacts.add(recipientJid);
        state.newContactsThisHour += 1;
      }
      state.contactedThisHour.add(recipientJid);
    }
  }

  _getMsUntilMidnight() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return midnight.getTime() - now.getTime();
  }

  _scheduleDailyReset() {
    const msUntilMidnight = this._getMsUntilMidnight();
    setTimeout(() => {
      this.resetDaily();
      // Then repeat every 24h
      setInterval(() => this.resetDaily(), 86400000);
    }, msUntilMidnight);
  }

  resetDaily() {
    const cfg = this.getActiveConfig();
    for (const [sessionId, state] of this.sessions.entries()) {
      state.dailySentCount = 0;
      state.warmupDay += 1;
      // Daily warmup scale: +20% each day up to dailyCapMax
      state.dailyLimit = Math.min(Math.floor(state.dailyLimit * 1.2), cfg.dailyCapMax);
      logger.info(`[AntiBan] Daily reset for session ${sessionId}. Day ${state.warmupDay}, new limit: ${state.dailyLimit} msgs/day.`);
    }
  }

  getSessionStats(sessionId) {
    const state = this._getOrCreateSessionState(sessionId);
    const cfg = this.getActiveConfig();
    const now = Date.now();
    const recentInMinute = state.minuteTimestamps.filter((t) => now - t < 60000).length;

    return {
      mode: this.mode,
      profileName: cfg.name,
      minuteStats: {
        sentInLastMinute: recentInMinute,
        maxPerMinute: cfg.maxPerMinute
      },
      dailyStats: {
        sentToday: state.dailySentCount,
        dailyLimit: state.dailyLimit,
        warmupDay: state.warmupDay
      },
      hourlyStats: {
        newContactsThisHour: state.newContactsThisHour,
        maxNewContactsPerHour: cfg.maxNewContactsPerHour
      },
      pacing: {
        hardMinGapSeconds: cfg.hardMinGapMs / 1000,
        sameRecipientCooldownSeconds: cfg.sameRecipientCooldownMs / 1000,
        burstThreshold: cfg.burstThreshold,
        currentBurstCount: state.burstCount
      },
      status: state.dailySentCount >= state.dailyLimit
        ? 'DAILY_CAP_REACHED'
        : recentInMinute >= cfg.maxPerMinute
        ? 'PACING_WAIT'
        : 'READY'
    };
  }
}

export default new AntiBanService();
