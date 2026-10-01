import { activeSessions } from '../services/session.service.js';
import db from '../models/index.js';
import logger from '../utils/logger.js';

let timer = null;

const checkSessions = async () => {
  try {
    const dbSessions = await db.Session.findAll({
      where: {
        status: ['connected', 'qr', 'starting', 'reconnecting']
      }
    });

    for (const session of dbSessions) {
      const provider = activeSessions.get(session.id);
      
      if (!provider) {
        logger.warn(`Watchdog: Provider for session ${session.id} not found in memory but DB status is ${session.status}`);
        // We could trigger a restore for this specific session if needed
        continue;
      }

      if (session.status === 'connected') {
        const sock = provider.sock;
        if (!sock || !sock.ws || sock.ws.readyState !== 1 /* OPEN */) {
          logger.warn(`Watchdog: Socket for session ${session.id} appears dead/unresponsive.`);
          provider.reconnectWithBackoff();
        }
      }
    }
  } catch (error) {
    logger.error('Watchdog error:', error);
  }
};

export const start = () => {
  if (timer) return;
  logger.info('Starting session watchdog worker (runs every 30s)');
  timer = setInterval(checkSessions, 30000);
};

export const stop = () => {
  if (timer) {
    logger.info('Stopping session watchdog worker');
    clearInterval(timer);
    timer = null;
  }
};

export default { start, stop };
