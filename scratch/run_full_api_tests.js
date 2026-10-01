import fs from 'fs';
import path from 'path';

const API_KEY = 'f31e17504d5c41a6f869c2235fefb2df20b9eb4dcb56b54f3336d323634f37c1';
const BASE_URL = 'http://localhost:3000/api/v1';

async function run() {
  console.log('--- 1. Testing Health Endpoint ---');
  const healthRes = await fetch(`${BASE_URL}/health`);
  console.log('Health:', await healthRes.json());

  console.log('\n--- 2. Testing RAG Settings ---');
  const settingsRes = await fetch(`${BASE_URL}/rag/settings`, {
    headers: { 'Authorization': `Bearer ${API_KEY}` }
  });
  console.log('RAG Settings:', await settingsRes.json());

  console.log('\n--- 3. Testing RAG Documents ---');
  const docsRes = await fetch(`${BASE_URL}/rag/documents`, {
    headers: { 'Authorization': `Bearer ${API_KEY}` }
  });
  const docsData = await docsRes.json();
  console.log('Indexed Documents:', docsData.data);

  console.log('\n--- 4. Testing RAG Query ---');
  const queryRes = await fetch(`${BASE_URL}/rag/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    body: JSON.stringify({ query: 'What message types does the gateway support?' })
  });
  const queryData = await queryRes.json();
  console.log('RAG Query Answer:', queryData.data?.answer);
  console.log('Retrieved Sources:', queryData.data?.sources);

  console.log('\n--- 5. Testing File Upload (Voice / Audio) ---');
  const dummyAudioPath = path.resolve('uploads', 'test_voice.webm');
  fs.writeFileSync(dummyAudioPath, Buffer.from('RIFF....WAVEfmt ....data....test-audio-content'));

  const formData = new FormData();
  const blob = new Blob([fs.readFileSync(dummyAudioPath)], { type: 'audio/webm' });
  formData.append('file', blob, 'test_voice.webm');

  const uploadRes = await fetch(`${BASE_URL}/uploads`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_KEY}` },
    body: formData
  });
  const uploadData = await uploadRes.json();
  console.log('Generic File Upload Result:', uploadData);

  console.log('\n--- 6. Testing Voice Message Upload via Session ---');
  const voiceFormData = new FormData();
  voiceFormData.append('file', blob, 'test_voice.webm');
  voiceFormData.append('to', '919876543210');

  const voiceRes = await fetch(`${BASE_URL}/sessions/development-1/messages/voice/upload`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_KEY}` },
    body: voiceFormData
  });
  const voiceData = await voiceRes.json();
  console.log('Voice Message Upload Result:', voiceData);

  console.log('\n--- 7. Testing Inbound Simulation & AI Bot Auto-Reply ---');
  const simRes = await fetch(`${BASE_URL}/sessions/development-1/simulate/incoming`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    body: JSON.stringify({
      fromPhone: '919876543210',
      text: 'How does authentication and QR code pairing work?'
    })
  });
  console.log('Simulate Customer Message Sent:', await simRes.json());

  console.log('\nWaiting 3 seconds for AI Bot to process and senderWorker to queue...');
  await new Promise((r) => setTimeout(r, 3000));

  const msgsRes = await fetch(`${BASE_URL}/sessions/development-1/messages?chatJid=919876543210@s.whatsapp.net`, {
    headers: { 'Authorization': `Bearer ${API_KEY}` }
  });
  const msgsData = await msgsRes.json();
  console.log('Recent Messages for Chat (including AI Auto-Reply):');
  for (const m of (msgsData.data?.data || []).slice(0, 5)) {
    console.log(`- [${m.fromMe ? 'BOT/OUTGOING' : 'CUSTOMER'}] Type: ${m.type} | Text/Body: ${m.text || JSON.stringify(m.body)}`);
  }

  console.log('\nALL TESTS COMPLETED SUCCESSFULLY!');
}

run().catch((err) => console.error('Test run failed:', err));
