import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class Webhook extends Model {
  static associate(models) {
    Webhook.belongsTo(models.Session, { foreignKey: 'sessionId', as: 'session' });
    Webhook.hasMany(models.WebhookDelivery, { foreignKey: 'webhookId', as: 'deliveries' });
  }
}

Webhook.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    sessionId: {
      type: DataTypes.STRING,
      allowNull: false
    },
    url: {
      type: DataTypes.STRING,
      allowNull: false
    },
    secret: {
      type: DataTypes.STRING,
      allowNull: false
    },
    events: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: []
    },
    chatJids: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: []
    },
    active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    }
  },
  {
    sequelize,
    modelName: 'Webhook',
    tableName: 'webhooks',
    indexes: [
      {
        fields: ['sessionId', 'active']
      }
    ]
  }
);

export default Webhook;
