'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Documents table
    await queryInterface.createTable('knowledge_documents', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      filename: {
        type: Sequelize.STRING,
        allowNull: false
      },
      title: {
        type: Sequelize.STRING,
        allowNull: false
      },
      mimeType: {
        type: Sequelize.STRING,
        allowNull: false
      },
      size: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      totalChunks: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    // 2. Try creating pgvector extension if available
    let hasNativeVector = false;
    try {
      await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;');
      hasNativeVector = true;
    } catch {
      hasNativeVector = false;
    }

    // 3. Fallback PostgreSQL cosine similarity function if native vector extension is unavailable
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION cosine_similarity(a float8[], b float8[])
      RETURNS float8 AS $$
      DECLARE
        dot float8 := 0;
        mag_a float8 := 0;
        mag_b float8 := 0;
        i int;
      BEGIN
        IF a IS NULL OR b IS NULL THEN
          RETURN 0;
        END IF;
        FOR i IN 1..LEAST(array_length(a, 1), array_length(b, 1)) LOOP
          dot := dot + a[i] * b[i];
          mag_a := mag_a + a[i] * a[i];
          mag_b := mag_b + b[i] * b[i];
        END LOOP;
        IF mag_a = 0 OR mag_b = 0 THEN
          RETURN 0;
        END IF;
        RETURN dot / (sqrt(mag_a) * sqrt(mag_b));
      END;
      $$ LANGUAGE plpgsql IMMUTABLE STRICT;
    `);

    // 4. Chunks table
    await queryInterface.createTable('knowledge_chunks', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      documentId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'knowledge_documents',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      content: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      embedding: {
        type: Sequelize.ARRAY(Sequelize.FLOAT),
        allowNull: true
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    await queryInterface.addIndex('knowledge_chunks', ['documentId']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('knowledge_chunks');
    await queryInterface.dropTable('knowledge_documents');
    await queryInterface.sequelize.query('DROP FUNCTION IF EXISTS cosine_similarity(float8[], float8[]);');
  }
};
