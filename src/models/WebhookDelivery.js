import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class WebhookDelivery extends Model {
  static associate(models) {
    WebhookDelivery.belongsTo(models.Webhook, { foreignKey: 'webhookId', as: 'webhook' });
  }
}

WebhookDelivery.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    webhookId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    messageId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    event: {
      type: DataTypes.STRING,
      allowNull: false
    },
    payload: {
      type: DataTypes.JSONB,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('pending', 'delivered', 'failed', 'dead'),
      allowNull: false,
      defaultValue: 'pending'
    },
    attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    nextRetryAt: {
      type: DataTypes.DATE,
      allowNull: false
    },
    lastError: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    lastStatusCode: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  },
  {
    sequelize,
    modelName: 'WebhookDelivery',
    tableName: 'webhook_deliveries',
    indexes: [
      {
        fields: ['status', 'nextRetryAt']
      }
    ]
  }
);

export default WebhookDelivery;
