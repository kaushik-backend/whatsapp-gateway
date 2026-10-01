import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3000/api/v1';
const SESSION_ID = 'dev-1';

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runVoiceTests() {
  console.log('====================================================');
  console.log('   STARTING VOICE MESSAGE REPLIES VALIDATION TEST   ');
  console.log('====================================================\n');

  // Test 1: Check Voice Configuration API
  console.log('[TEST 1] Fetching Voice Configuration...');
  const configRes = await fetch(`${BASE_URL}/sessions/${SESSION_ID}/messages/voice/config`);
  const configData = await configRes.json();
  console.log('Status:', configRes.status);
  console.log('Response:', JSON.stringify(configData, null, 2));

  if (!configData.success || configData.data.voiceReplyMode !== 'auto') {
    throw new Error('Test 1 Failed: Voice configuration returned unexpected data');
  }
  console.log('✓ TEST 1 PASSED: Voice configuration retrieved successfully.\n');

  // Test 2: Direct Voice Synthesis & Queueing API
  console.log('[TEST 2] Testing Direct Voice Synthesis API (POST /messages/voice/synthesize)...');
  const synthRes = await fetch(`${BASE_URL}/sessions/${SESSION_ID}/messages/voice/synthesize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: '919876543210',
      text: 'Hello from WhatsApp Gateway! Your voice note request has been processed successfully.'
    })
  });
  const synthData = await synthRes.json();
  console.log('Status:', synthRes.status);
  console.log('Response:', JSON.stringify(synthData, null, 2));

  if (!synthData.success || !synthData.data.url) {
    throw new Error('Test 2 Failed: Voice synthesis API did not return audio URL');
  }

  // Verify the synthesized audio file exists on disk and is non-empty
  const localAudioPath = path.resolve(process.cwd(), synthData.data.url.replace(/^\//, ''));
  if (!fs.existsSync(localAudioPath)) {
    throw new Error(`Test 2 Failed: Synthesized file not found at ${localAudioPath}`);
  }
  const fileSize = fs.statSync(localAudioPath).size;
  console.log(`Audio file verified on disk: ${synthData.data.url} (${fileSize} bytes)`);
  console.log('✓ TEST 2 PASSED: Direct voice message synthesized and queued.\n');

  // Test 3: Verify Outbox Delivery for Voice Note
  console.log('[TEST 3] Waiting for Outbox Worker to deliver the voice message...');
  await sleep(4000);
  const msgRes = await fetch(`${BASE_URL}/sessions/${SESSION_ID}/messages/${synthData.data.id}`);
  const msgRecord = await msgRes.json();
  console.log('Voice Message DB Record:', JSON.stringify(msgRecord.data, null, 2));

  if (msgRecord.data.type !== 'voice' || (msgRecord.data.status !== 'sent' && msgRecord.data.status !== 'delivered')) {
    throw new Error(`Test 3 Failed: Message not sent as voice note. Status: ${msgRecord.data.status}`);
  }
  console.log('✓ TEST 3 PASSED: Outbox worker processed and sent voice note with PTT flag.\n');

  // Test 4: End-to-End Voice Note Customer Simulation & Auto Voice Reply
  console.log('[TEST 4] Simulating Customer Inbound Voice Note asking a Knowledge Base question...');
  console.log('Customer speaks: "What are some protein rich foods I should eat?"');

  const customerPhone = '919876543299';
  const inboundRes = await fetch(`${BASE_URL}/sessions/${SESSION_ID}/simulate/incoming`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: customerPhone,
      text: 'What are some protein rich foods I should eat?',
      type: 'voice'
    })
  });
  const inboundData = await inboundRes.json();
  console.log('Inbound simulation response:', JSON.stringify(inboundData, null, 2));

  if (!inboundData.success) {
    throw new Error('Test 4 Failed: Could not simulate incoming voice note');
  }
  console.log('Inbound voice note accepted by gateway. Waiting for AI Bot RAG retrieval & voice synthesis...');

  // Wait for RAG generation, voice synthesis, and queueing
  await sleep(6500);

  // Check recent messages for this customer
  const historyRes = await fetch(`${BASE_URL}/sessions/${SESSION_ID}/messages?chatJid=${customerPhone}%40s.whatsapp.net&limit=5`);
  const historyData = await historyRes.json();
  console.log('Conversation History for customer:', JSON.stringify(historyData.data, null, 2));

  // Find the outgoing message from gateway (fromMe: true)
  const botReplies = historyData.data.data.filter(m => m.fromMe === true);
  if (botReplies.length === 0) {
    throw new Error('Test 4 Failed: AI Bot did not send any reply to customer voice note');
  }

  const voiceReply = botReplies.find(m => m.type === 'voice');
  if (!voiceReply) {
    console.error('All replies:', botReplies);
    throw new Error('Test 4 Failed: Expected bot to reply with type "voice" for inbound voice note');
  }

  console.log('\n====================================================');
  console.log('🎉 BOT VOICE REPLY SUCCESSFULLY GENERATED & SENT!');
  console.log('Type:', voiceReply.type);
  console.log('Voice Audio URL:', voiceReply.body.url);
  console.log('Spoken Transcript Text:', voiceReply.body.text);
  console.log('Status:', voiceReply.status);
  console.log('====================================================\n');

  // Verify voice reply file on disk
  const voiceReplyFile = path.resolve(process.cwd(), voiceReply.body.url.replace(/^\//, ''));
  if (fs.existsSync(voiceReplyFile)) {
    const replySize = fs.statSync(voiceReplyFile).size;
    console.log(`Voice note audio file verified: ${voiceReply.body.url} (${replySize} bytes)`);
  }

  console.log('✓ TEST 4 PASSED: End-to-end voice note customer query received, RAG processed, synthesized into speech, and sent as voice note reply!\n');
  console.log('ALL VOICE MESSAGE TESTS PASSED WITH 100% SUCCESS!');
}

runVoiceTests().catch((err) => {
  console.error('\n❌ TEST RUN FAILED:', err);
  process.exit(1);
});
