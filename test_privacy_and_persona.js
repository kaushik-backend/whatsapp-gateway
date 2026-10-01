import http from 'http';

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('=== RUNNING PRIVACY ISOLATION & NATURAL PERSONA VERIFICATION ===\n');
  const sessionId = 'dev-1';

  // 1. Check/Set Privacy Mode to target_only with allowed contact 919876543210
  console.log('1. Setting Privacy Filter to target_only with whitelist: ["919876543210"]...');
  const setPrivacyRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/v1/sessions/${sessionId}/privacy`,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' }
  }, {
    mode: 'target_only',
    allowedContacts: ['919876543210@s.whatsapp.net'],
    ignoreGroups: true
  });
  console.log('Privacy Config Response:', setPrivacyRes.status, JSON.stringify(setPrivacyRes.body.data));

  // 2. Simulate incoming message from an UN-WHITELISTED personal contact (e.g. 919999999999)
  const personalPhone = '919999999999';
  console.log(`\n2. Simulating incoming message from PERSONAL phone list contact (+${personalPhone})...`);
  const personalMsgRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/v1/sessions/${sessionId}/simulate/incoming`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    from: personalPhone,
    text: 'Hey dude, what are you doing tonight? Let us meet at the coffee shop.'
  });
  console.log('Simulate Call Status:', personalMsgRes.status);

  // Wait a moment for async processing
  await new Promise((r) => setTimeout(r, 1000));

  // 3. Verify that the personal contact message was NOT stored in the database / messages list
  console.log('\n3. Querying messages to verify personal contact is HIDDEN from admin...');
  const msgListRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/v1/sessions/${sessionId}/messages?chatJid=${personalPhone}@s.whatsapp.net`,
    method: 'GET'
  });
  const rawPersonal = msgListRes.body?.data?.rows || msgListRes.body?.data || [];
  const personalMessages = Array.isArray(rawPersonal) ? rawPersonal : [];
  console.log(`Found ${personalMessages.length} messages for personal contact ${personalPhone}`);
  if (personalMessages.length === 0) {
    console.log(' SUCCESS: Personal contact message was DROPPED at privacy boundary and NEVER stored in DB!');
  } else {
    console.error(' FAILURE: Personal contact message was stored in DB!');
  }

  // 4. Simulate incoming message from the DESIGNATED ALLOWED customer (919876543210)
  const customerPhone = '919876543210';
  console.log(`\n4. Simulating incoming message from DESIGNATED ALLOWED contact (+${customerPhone})...`);
  const allowedMsgRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/v1/sessions/${sessionId}/simulate/incoming`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    from: customerPhone,
    text: 'What category should I use for a password problem?'
  });
  console.log('Simulate Call Status:', allowedMsgRes.status);

  // Wait for RAG / AI processing
  await new Promise((r) => setTimeout(r, 2000));

  // 5. Query messages for the allowed customer
  console.log('\n5. Querying messages to verify allowed contact conversation is visible to admin...');
  const allowedMsgListRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/v1/sessions/${sessionId}/messages?chatJid=${customerPhone}@s.whatsapp.net`,
    method: 'GET'
  });
  const rawAllowed = allowedMsgListRes.body?.data?.rows || allowedMsgListRes.body?.data || [];
  const allowedMessages = Array.isArray(rawAllowed) ? rawAllowed : [];
  console.log(`Found ${allowedMessages.length} messages for allowed contact ${customerPhone}`);
  if (allowedMessages.length > 0) {
    console.log(' SUCCESS: Allowed contact conversation is captured and available for admin!');
  }


  // 6. Test RAG Natural Human Response format (Zero emojis, zero bullets, natural human phrasing)
  console.log('\n6. Testing RAG natural human response for password category question...');
  const ragRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/rag/query',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    query: 'What category should I use for a password problem?'
  });

  const reply = ragRes.body?.data?.answer || '';

  console.log('\nRAG AI Output:\n------------------------------------');
  console.log(reply);
  console.log('------------------------------------');

  const hasEmoji = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(reply);
  const hasAsterisks = /\*/.test(reply);
  const hasBullet = /[•\-\*]\s+/.test(reply);
  const hasCannedOpener = /(Hey there|Good question|Here's the scoop)/i.test(reply);

  console.log('Validation Checks:');
  console.log('- Has Emojis:', hasEmoji ? 'FAIL' : 'PASS (0 emojis)');
  console.log('- Has Asterisks (*bold*):', hasAsterisks ? 'FAIL' : 'PASS (Clean plain text)');
  console.log('- Has Bullet points:', hasBullet ? 'FAIL' : 'PASS (Natural prose)');
  console.log('- Has Canned Bot Openers:', hasCannedOpener ? 'FAIL' : 'PASS (Natural human)');

  console.log('\n=== ALL PRIVACY & HUMAN PERSONA VERIFICATION COMPLETE ===');
}

runTests().catch(console.error);
