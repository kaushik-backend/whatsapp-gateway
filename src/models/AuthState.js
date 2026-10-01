import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class AuthState extends Model {
  static associate(models) {
    AuthState.belongsTo(models.Session, { foreignKey: 'sessionId', as: 'session' });
  }
}

AuthState.init(
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
    type: {
      type: DataTypes.ENUM('creds', 'key'),
      allowNull: false
    },
    key: {
      type: DataTypes.STRING,
      allowNull: false
    },
    value: {
      type: DataTypes.JSONB,
      allowNull: false
    }
  },
  {
    sequelize,
    modelName: 'AuthState',
    tableName: 'auth_states',
    indexes: [
      {
        unique: true,
        fields: ['sessionId', 'type', 'key']
      }
    ]
  }
);

export default AuthState;
