import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class Message extends Model {
  static associate(models) {
    Message.belongsTo(models.Session, { foreignKey: 'sessionId', as: 'session' });
  }
}

Message.init(
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
    waMessageId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    chatJid: {
      type: DataTypes.STRING,
      allowNull: false
    },
    fromMe: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    type: {
      type: DataTypes.ENUM('text', 'image', 'document', 'voice', 'reaction'),
      allowNull: false
    },
    body: {
      type: DataTypes.JSONB,
      allowNull: false
    },
    timestamp: {
      type: DataTypes.BIGINT,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('queued', 'sent', 'delivered', 'read', 'failed'),
      allowNull: false
    },
    idempotencyKey: {
      type: DataTypes.STRING,
      allowNull: true
    }
  },
  {
    sequelize,
    modelName: 'Message',
    tableName: 'messages',
    indexes: [
      {
        unique: true,
        fields: ['idempotencyKey'],
        where: {
          idempotencyKey: {
            [sequelize.Sequelize.Op.ne]: null
          }
        }
      },
      {
        fields: ['sessionId', 'chatJid']
      },
      {
        fields: ['waMessageId']
      }
    ]
  }
);

export default Message;
