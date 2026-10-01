import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class ApiKey extends Model {
  static associate(models) {
    // No associations specified
  }
}

ApiKey.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    keyHash: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    keyPrefix: {
      type: DataTypes.STRING,
      allowNull: false
    },
    scopes: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: []
    },
    sessionIds: {
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
    modelName: 'ApiKey',
    tableName: 'api_keys',
    hooks: {
      beforeCreate: (apiKey) => {
        if (apiKey.rawKey) {
          apiKey.keyPrefix = apiKey.rawKey.substring(0, 12);
        }
      }
    }
  }
);

export default ApiKey;
