import { ragService } from '../src/services/rag.service.js';
import db from '../src/models/index.js';

async function test() {
  await db.sequelize.authenticate();
  console.log('Database connected.');
  
  await ragService.autoSeedInitialDocs();
  console.log('Auto-seed executed.');

  const docs = await db.KnowledgeDocument.findAll();
  console.log('Knowledge documents in DB:', docs.map(d => ({ title: d.title, chunks: d.totalChunks })));

  const query = 'How does authentication and QR code pairing work?';
  console.log('Testing query:', query);
  const res = await ragService.answerQuestion({ query });

  console.log('Result Answer:');
  console.log(res.answer);
  console.log('Sources:');
  console.log(res.sources);

  process.exit(0);
}

test().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
