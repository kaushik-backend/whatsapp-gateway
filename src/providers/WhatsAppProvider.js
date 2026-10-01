import { EventEmitter } from 'events';

export default class WhatsAppProvider extends EventEmitter {
  constructor() {
    super();
    if (this.constructor === WhatsAppProvider) {
      throw new Error('Abstract classes cannot be instantiated.');
    }
  }

  async connect() { throw new Error('Not implemented'); }
  async disconnect() { throw new Error('Not implemented'); }
  async getQR() { throw new Error('Not implemented'); }
  async sendTextMessage(jid, text) { throw new Error('Not implemented'); }
  async sendImageMessage(jid, url, caption) { throw new Error('Not implemented'); }
  async sendDocumentMessage(jid, url, filename, mimetype) { throw new Error('Not implemented'); }
  async sendVoiceMessage(jid, url) { throw new Error('Not implemented'); }
  async sendReaction(jid, messageId, emoji) { throw new Error('Not implemented'); }
  async sendPresenceUpdate(jid, type) { throw new Error('Not implemented'); }
}
