import sequelize from '../config/database.js';
import { Sequelize } from 'sequelize';

import Session from './Session.js';
import AuthState from './AuthState.js';
import ApiKey from './ApiKey.js';
import Message from './Message.js';
import OutboxJob from './OutboxJob.js';
import Webhook from './Webhook.js';
import WebhookDelivery from './WebhookDelivery.js';
import KnowledgeDocument from './KnowledgeDocument.js';
import KnowledgeChunk from './KnowledgeChunk.js';

const models = {
  Session,
  AuthState,
  ApiKey,
  Message,
  OutboxJob,
  Webhook,
  WebhookDelivery,
  KnowledgeDocument,
  KnowledgeChunk
};

Object.values(models).forEach((model) => {
  if (model.associate) {
    model.associate(models);
  }
});

models.sequelize = sequelize;
models.Sequelize = Sequelize;

export {
  sequelize,
  Sequelize,
  Session,
  AuthState,
  ApiKey,
  Message,
  OutboxJob,
  Webhook,
  WebhookDelivery,
  KnowledgeDocument,
  KnowledgeChunk
};
export default models;
