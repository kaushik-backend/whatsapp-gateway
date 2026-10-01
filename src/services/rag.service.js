import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import mammoth from 'mammoth';
import db from '../models/index.js';
import logger from '../utils/logger.js';
import config from '../config/index.js';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

class RagService {
  normalizeModelName(name) {
    if (!name) return 'gemini-flash-latest';
    const cleaned = name.trim().toLowerCase();
    // Google v1beta aliasing: Gemini 1.5 Flash is aliased to gemini-flash-latest
    if (cleaned === 'gemini-1.5-flash' || cleaned === 'gemini-1.5-flash-latest' || cleaned === 'models/gemini-1.5-flash') {
      return 'gemini-flash-latest';
    }
    if (cleaned === 'gemini-1.5-pro' || cleaned === 'models/gemini-1.5-pro') {
      return 'gemini-pro-latest';
    }
    return name.trim();
  }

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || config.gemini?.apiKey || '';
    const rawModel = process.env.GEMINI_MODEL || config.gemini?.model || 'gemini-flash-latest';
    this.modelName = this.normalizeModelName(rawModel);
    this.embeddingModelName = 'gemini-embedding-001';
  }

  getApiKey() {
    return process.env.GEMINI_API_KEY || this.apiKey || config.gemini?.apiKey || '';
  }

  getModelName() {
    const rawModel = process.env.GEMINI_MODEL || this.modelName || config.gemini?.model || 'gemini-flash-latest';
    return this.normalizeModelName(rawModel);
  }

  setApiKey(key) {
    this.apiKey = key;
    process.env.GEMINI_API_KEY = key;
    if (config.gemini) {
      config.gemini.apiKey = key;
    }
  }

  isConfigured() {
    return Boolean(this.getApiKey() && this.getApiKey().trim().length > 10);
  }

  /**
   * Convert LaTeX exponents and carets to pure Unicode mathematical superscripts and symbols
   * so powers like A^n, A^-1, A^2 render as pure math (Aⁿ, A⁻¹, A²) on WhatsApp.
   */
  formatMathForWhatsApp(text) {
    if (!text || typeof text !== 'string') return text;

    const superMap = {
      '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
      '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
      '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
      'n': 'ⁿ', 'i': 'ⁱ', 'x': 'ˣ', 'y': 'ʸ', 'm': 'ᵐ', 'k': 'ᵏ'
    };

    const subMap = {
      '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
      '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
      '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
      'n': 'ₙ', 'i': 'ᵢ', 'j': 'ⱼ', 'k': 'ₖ', 'x': 'ₓ'
    };

    return text
      // Convert LaTeX environments
      .replace(/\\begin\{aligned\}|\\end\{aligned\}|\\begin\{equation\}|\\end\{equation\}/g, '')
      // Convert superscripts with braces: A^{-1}, A^{n-1}, A^{2}
      .replace(/\^\{([^}]+)\}/g, (_, exp) => exp.split('').map((c) => superMap[c] || c).join(''))
      // Convert superscripts without braces: A^-1, A^n, A^2, A^3
      .replace(/\^([0-9nixymk\+\-]+)/g, (_, exp) => exp.split('').map((c) => superMap[c] || c).join(''))
      // Convert subscripts with braces: c_{n-1}, c_{0}
      .replace(/_\{([^}]+)\}/g, (_, sub) => sub.split('').map((c) => subMap[c] || c).join(''))
      // Convert subscripts without braces: c_0, c_1, \lambda_i
      .replace(/_([0-9nijkx\+\-]+)/g, (_, sub) => sub.split('').map((c) => subMap[c] || c).join(''))
      // Common math symbols
      .replace(/\\implies/g, '⇒')
      .replace(/\\iff/g, '⇔')
      .replace(/\\to/g, '→')
      .replace(/\\dots/g, '...')
      .replace(/\\cdots/g, '...')
      .replace(/\\lambda/g, 'λ')
      .replace(/\\det/g, 'det')
      .replace(/\\nabla/g, '∇')
      .replace(/\\cdot/g, '·')
      .replace(/\\neq/g, '≠')
      .replace(/\\leq/g, '≤')
      .replace(/\\geq/g, '≥')
      .replace(/\\frac\{1\}\{5\}/g, '⅕')
      .replace(/\\frac\{1\}\{([0-9]+)\}/g, '1/$1')
      .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)')
      .replace(/\\mathbf\{([^}]+)\}/g, '$1')
      .replace(/\\text\{([^}]+)\}/g, '$1')
      // Strip leftover $$ and $
      .replace(/\$\$/g, '')
      .replace(/\$/g, '');
  }

  /**
   * Clean text to sound like a plain human reply (strips emojis, asterisks, bullet markers, etc.)
   */
  cleanHumanText(text) {
    if (!text || typeof text !== 'string') return text;

    let clean = this.formatMathForWhatsApp(text);

    return clean
      // Remove all emojis
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E6}-\u{1F1FF}]/gu, '')
      // Remove formatting stars (*bold* or *italic*)
      .replace(/\*/g, '')
      // Remove bullet point markers at line starts
      .replace(/^[•\-\*\s]+/gm, '')
      // Remove markdown header hashes
      .replace(/^#+\s*/gm, '')
      // Remove robotic disclaimers / artificial openers
      .replace(/^Hey there!?\s*👋?\s*/gi, '')
      .replace(/\bGood question\s*[-—]?\s*/gi, '')
      .replace(/\bHere's the scoop:\s*/gi, '')
      // Clean up multiple spaces and empty lines
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .trim();
  }

  /**
   * Split raw text into chunks with overlap
   */
  chunkText(text, chunkSize = 700, chunkOverlap = 100) {
    if (!text || typeof text !== 'string') return [];
    
    // Normalize newlines and whitespace
    const cleanText = text.replace(/\r\n/g, '\n').trim();
    if (!cleanText) return [];

    const chunks = [];
    let start = 0;

    while (start < cleanText.length) {
      if (start + chunkSize >= cleanText.length) {
        const remaining = cleanText.substring(start).trim();
        if (remaining.length > 0) chunks.push(remaining);
        break;
      }

      let end = start + chunkSize;
      let breakPoint = cleanText.lastIndexOf('\n\n---\n\n', end);
      if (breakPoint < start + 150) {
        breakPoint = cleanText.lastIndexOf('\n\n## ', end);
      }
      if (breakPoint < start + 150) {
        breakPoint = cleanText.lastIndexOf('\n\n', end);
      }
      if (breakPoint < start + 150) {
        breakPoint = cleanText.lastIndexOf('\n', end);
      }
      if (breakPoint < start + 150) {
        breakPoint = cleanText.lastIndexOf('. ', end);
        if (breakPoint > start) breakPoint += 1; // Include period
      }
      if (breakPoint <= start) {
        breakPoint = end;
      }

      const chunk = cleanText.substring(start, breakPoint).trim();
      if (chunk.length > 0) {
        chunks.push(chunk);
      }

      start = breakPoint;
    }

    return chunks;
  }

  /**
   * Generate vector embedding for text using Google Gemini
   * Falls back to a deterministic semantic vector if API key is not configured
   */
  async generateEmbedding(text) {
    const key = this.getApiKey();
    if (key) {
      try {
        const embeddings = new GoogleGenerativeAIEmbeddings({
          apiKey: key,
          model: this.embeddingModelName
        });
        const vector = await embeddings.embedQuery(text);
        return vector;
      } catch (err) {
        logger.warn(`Google embedding failed (${err.message}). Using fallback vector representation.`);
      }
    }

    // Fallback: 768-dimensional normalized term & character hash embedding
    return this._createFallbackVector(text, 768);
  }

  /**
   * Generates a 768-d normalized vector based on hashed n-grams & keywords
   */
  _createFallbackVector(text, dim = 768) {
    const STOP_WORDS = new Set([
      'what', 'are', 'the', 'should', 'i', 'a', 'an', 'and', 'or', 'in', 'on', 'to', 
      'of', 'for', 'with', 'is', 'was', 'it', 'take', 'can', 'you', 'my', 'do', 
      'how', 'me', 'we', 'they', 'this', 'that', 'from', 'at', 'by', 'as', 'be', 'so',
      'there', 'some', 'any', 'about'
    ]);

    const vec = new Array(dim).fill(0);
    const words = text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
    
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      let hash = 0;
      for (let j = 0; j < w.length; j++) {
        hash = (hash * 31 + w.charCodeAt(j)) & 0xffffffff;
      }
      const idx = Math.abs(hash) % dim;
      vec[idx] += 1;

      // Bigrams
      if (i > 0) {
        const bigram = words[i - 1] + '_' + w;
        let bHash = 0;
        for (let j = 0; j < bigram.length; j++) {
          bHash = (bHash * 37 + bigram.charCodeAt(j)) & 0xffffffff;
        }
        const bIdx = Math.abs(bHash) % dim;
        vec[bIdx] += 1.5;
      }
    }

    // Normalize vector to unit length
    let norm = 0;
    for (let i = 0; i < dim; i++) {
      norm += vec[i] * vec[i];
    }
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < dim; i++) {
        vec[i] /= norm;
      }
    }
    return vec;
  }

  /**
   * Parse uploaded or local document file into text
   */
  async extractTextFromFile(filePath, mimeType) {
    const buffer = fs.readFileSync(filePath);
    const safeMime = (mimeType || '').toLowerCase();

    if (safeMime.includes('pdf') || filePath.endsWith('.pdf')) {
      const data = await pdfParse(buffer);
      return data.text || '';
    }

    if (
      safeMime.includes('wordprocessingml') ||
      safeMime.includes('docx') ||
      filePath.endsWith('.docx')
    ) {
      const result = await mammoth.extractRawText({ buffer });
      return result.value || '';
    }

    // Default: text, markdown, json, etc.
    return buffer.toString('utf-8');
  }

  /**
   * Ingest a document file into the RAG Knowledge Base
   */
  async ingestFile({ filePath, originalName, mimeType, title = null }) {
    logger.info(`Ingesting document: ${originalName} (${mimeType})`);
    const docTitle = title || path.parse(originalName).name.replace(/[-_]/g, ' ');
    const rawText = await this.extractTextFromFile(filePath, mimeType);

    if (!rawText || rawText.trim().length === 0) {
      throw new Error(`File ${originalName} contains no readable text.`);
    }

    const chunks = this.chunkText(rawText);
    logger.info(`Generated ${chunks.length} chunks for ${originalName}`);

    // Create KnowledgeDocument in Postgres
    const docRecord = await db.KnowledgeDocument.create({
      filename: path.basename(filePath),
      title: docTitle,
      mimeType: mimeType || 'text/plain',
      size: fs.statSync(filePath).size,
      totalChunks: chunks.length,
      metadata: { originalName }
    });

    // Create chunks and calculate embeddings
    for (let i = 0; i < chunks.length; i++) {
      const content = chunks[i];
      const embedding = await this.generateEmbedding(content);

      await db.KnowledgeChunk.create({
        documentId: docRecord.id,
        content,
        metadata: {
          chunkIndex: i,
          totalChunks: chunks.length,
          documentTitle: docTitle
        },
        embedding
      });
    }

    logger.info(`Document ${docTitle} successfully indexed with ${chunks.length} chunks.`);
    return docRecord;
  }

  /**
   * Retrieve similar chunks from PostgreSQL using vector cosine similarity
   */
  async retrieveRelevantContext(query, topK = 4) {
    if (!query || !query.trim()) return [];

    const queryEmbedding = await this.generateEmbedding(query);
    const pgArrayStr = `ARRAY[${queryEmbedding.join(',')}]::float8[]`;

    // Query Postgres using cosine_similarity function
    const [results] = await db.sequelize.query(
      `SELECT c.id, c."documentId", c.content, c.metadata, d.title as "documentTitle",
              cosine_similarity(c.embedding, ${pgArrayStr}) as similarity
       FROM knowledge_chunks c
       JOIN knowledge_documents d ON c."documentId" = d.id
       WHERE c.embedding IS NOT NULL
       ORDER BY similarity DESC
       LIMIT :topK;`,
      {
        replacements: { topK }
      }
    );

    return results;
  }

  /**
   * Handle natural pleasantries and greetings with human-like contextual empathy
   */
  _handleConversationalGreeting(query) {
    if (!query || typeof query !== 'string') return null;
    const q = query.trim().toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

    // 1. Time-of-day greetings
    if (/^(good\s+evening|evening)(\s+there)?$/i.test(q) || q.startsWith('good evening')) {
      return `Good evening! 🌆 Hope you've had a wonderful day so far. How can I help you today?`;
    }

    if (/^(good\s+morning|morning)(\s+there)?$/i.test(q) || q.startsWith('good morning')) {
      return `Good morning! ☀️ Hope your day is off to a great start. What can I help you with today?`;
    }

    if (/^(good\s+afternoon|afternoon)(\s+there)?$/i.test(q) || q.startsWith('good afternoon')) {
      return `Good afternoon! 🌤️ Hope your day is going smoothly. How can I help you today?`;
    }

    if (/^(good\s+night|night)(\s+there)?$/i.test(q) || q.startsWith('good night')) {
      return `Good night! 🌙 Rest well, and feel free to reach out whenever you're back!`;
    }

    // 2. Inquiries on well-being
    const howAreYou = ['how are you', 'how are you doing', 'hows it going', 'how is it going', 'how are things', 'whats up', 'what is up'];
    if (howAreYou.some((p) => q === p || q.startsWith(p))) {
      return `Doing great, thanks for asking! 😊 How are you doing today? Let me know what I can help you with!`;
    }

    // 3. General casual greetings
    const casualGreetings = ['hi', 'hello', 'hey', 'hey there', 'hi there', 'hola', 'namaste', 'start'];
    if (casualGreetings.includes(q)) {
      return `Hey! 👋 How's it going? How can I help you today?`;
    }

    // 4. Gratitude
    const thanks = ['thanks', 'thank you', 'thx', 'thank you so much', 'great thanks', 'perfect thanks', 'ok thanks', 'okay thanks', 'cheers', 'many thanks'];
    if (thanks.includes(q) || q.startsWith('thank you') || q.startsWith('thanks')) {
      return `You're very welcome! 😊 Glad I could help. Just drop a message here whenever you have any other questions!`;
    }

    // 5. Identity inquiries
    const who = ['who are you', 'what are you', 'who is this', 'what can you do', 'tell me about yourself'];
    if (who.includes(q) || who.some((p) => q.startsWith(p))) {
      return `Hey, I'm Alex! 👋 I help folks with WhatsApp API Gateway integrations & messaging, as well as healthy nutrition and diet planning. What can I help you with today?`;
    }

    return null;
  }

  /**
   * Check if query is asking about known off-topic subjects (weather, disease diagnosis, etc.)
   */
  _getOffTopicResponse(query) {
    if (!query || typeof query !== 'string') return null;
    const lower = query.toLowerCase();

    // Clinical disease diagnosis / prescription
    const clinicalWords = ['fever', 'headache', 'prescription drug', 'diagnose me', 'doctor appointment', 'coughing blood'];
    if (clinicalWords.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(lower))) {
      return `Hey there! 👋\n\nI can provide general nutritional guidelines and WhatsApp Gateway technical assistance, but I cannot provide clinical or medical diagnoses.\n\nFor medical concerns, please consult a qualified healthcare professional! 😊`;
    }

    // Weather
    const weatherWords = ['weather forecast', 'rain today', 'temperature today', 'rainfall prediction'];
    if (weatherWords.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(lower))) {
      return `Hey there! 👋\n\nI specialize in WhatsApp API Gateway solutions and Food & Nutrition guidance, so I don't track real-time weather!\n\nFeel free to ask about our WhatsApp APIs or nutritional planning! 🥗📱✨`;
    }

    return null;
  }

  /**
   * Check if query contains terms relevant to WhatsApp Gateway OR Food & Nutrition
   */
  _isDomainRelevant(query) {
    if (!query || typeof query !== 'string') return false;
    const lower = query.toLowerCase();

    const domainKeywords = [
      // WhatsApp & Gateway concepts
      'whatsapp', 'gateway', 'api', 'endpoint', 'endpoints', 'message', 'messages', 'messaging',
      'webhook', 'webhooks', 'session', 'sessions', 'qr', 'pair', 'pairing', 'link',
      'phone', 'number', 'token', 'auth', 'voice', 'audio', 'ptt', 'image', 'media',
      'document', 'pdf', 'file', 'queue', 'rate', 'limit', 'limits', 'retry', 'retries', 'socket',
      'connection', 'reconnect', 'payload', 'status', 'delivery', 'read', 'ack',
      'idempotency', 'signature', 'hmac', 'template', 'chat', 'bot', 'ai', 'rag',
      'postgres', 'database', 'docker', 'port', 'curl', 'server', 'baileys', 'outbox',
      'inbox', 'send', 'receive', 'client', 'http', 'json', 'post', 'get', 'support',
      // Food, Nutrition, Health & Diet concepts
      'food', 'diet', 'diets', 'nutrition', 'protein', 'calorie', 'calories', 'carb', 'carbs',
      'carbohydrate', 'carbohydrates', 'fat', 'fats', 'fiber', 'vitamin', 'vitamins', 'mineral',
      'minerals', 'meal', 'meals', 'breakfast', 'lunch', 'dinner', 'snack', 'paneer', 'tofu',
      'lentil', 'lentils', 'dal', 'chickpea', 'chickpeas', 'egg', 'eggs', 'chicken', 'fish',
      'salmon', 'meat', 'quinoa', 'oats', 'yogurt', 'curd', 'whey', 'hydration', 'water',
      'weight loss', 'muscle', 'hypertrophy', 'vegan', 'vegetarian', 'father', 'firoj', 'sardar',
      // Higher Mathematics concepts
      'math', 'mathematics', 'calculus', 'derivative', 'derivatives', 'integral', 'integrals',
      'integration', 'differentiation', 'differential', 'matrix', 'matrices', 'eigenvalue',
      'eigenvector', 'determinant', 'vector space', 'linear algebra', 'topology', 'fourier',
      'laplace', 'riemann', 'euler', 'cauchy', 'theorem', 'proof', 'algebra', 'probability',
      'tensor', 'limit', 'series', 'taylor', 'convergence', 'divergence', 'complex analysis'
    ];

    return domainKeywords.some((kw) => new RegExp(`\\b${kw}\\b`, 'i').test(lower));
  }

  /**
   * Check if query has content word overlap with retrieved chunks
   */
  _hasChunkOverlap(query, chunks) {
    if (!chunks || chunks.length === 0) return false;

    const STOP_WORDS = new Set([
      'what', 'are', 'the', 'should', 'i', 'a', 'an', 'and', 'or', 'in', 'on', 'to',
      'of', 'for', 'with', 'is', 'was', 'it', 'take', 'can', 'you', 'my', 'do',
      'how', 'me', 'we', 'they', 'this', 'that', 'from', 'at', 'by', 'as', 'be', 'so',
      'there', 'some', 'any', 'about', 'tell', 'give', 'know', 'would', 'will', 'much', 'time'
    ]);

    const words = query.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

    if (words.length === 0) return false;

    const topChunkText = chunks.slice(0, 2)
      .map((c) => (c.content || '') + ' ' + (c.documentTitle || ''))
      .join(' ')
      .toLowerCase();

    return words.some((w) => {
      if (topChunkText.includes(w)) return true;
      if (w.endsWith('s') && topChunkText.includes(w.slice(0, -1))) return true;
      if (w.endsWith('ing') && topChunkText.includes(w.slice(0, -3))) return true;
      if (w.endsWith('ed') && topChunkText.includes(w.slice(0, -2))) return true;
      return false;
    });
  }

  /**
   * Generate an AI answer using Gemini 1.5 Flash + RAG context
   */
  async answerQuestion({ query, chatHistory = [], topK = 4 }) {
    // 1. Natural pleasantries check
    const conversationalReply = this._handleConversationalGreeting(query);
    if (conversationalReply) {
      return {
        answer: conversationalReply,
        model: 'conversational-direct',
        isAiGenerated: false,
        sources: []
      };
    }

    const key = this.getApiKey();
    const relevantChunks = await this.retrieveRelevantContext(query, topK);
    const isDomain = this._isDomainRelevant(query);
    const hasOverlap = this._hasChunkOverlap(query, relevantChunks);

    const contextText = relevantChunks && relevantChunks.length > 0
      ? relevantChunks.map((c, i) => `[Topic: ${c.documentTitle}]\n${c.content}`).join('\n\n')
      : 'No specific documentation found for this query.';

    // Format recent chat history
    const historyText = chatHistory.length > 0
      ? chatHistory.map((m) => `${m.fromMe ? 'Support' : 'Customer'}: ${m.text || m.body?.text || ''}`).join('\n')
      : 'No prior chat history.';

    // Ultra-human conversational persona prompt (Turing-grade)
    const systemPrompt = `You are Alex, a friendly, perceptive, and knowledgeable human specialist.
You are texting directly with a user over WhatsApp.

CONVERSATIONAL REALISM & TURING EXCELLENCE:
1. HUMAN AUTHENTICITY & WARMTH:
   - Reply like a real human operator texting naturally on chat.
   - Speak directly, helpfully, and conversationally.
   - NEVER use robotic disclaimers ("As an AI", "Based on the provided documentation", "I am specialized in", "According to the context").
2. PLAIN HUMAN TEXT (NO EMOJIS, NO STARS, NO BULLETS/NUMBERS):
   - DO NOT use emojis (no 👋, 🔒, ✨, 📱, etc.).
   - DO NOT use formatting stars (*bold*), markdown, bullet points, numbers, or decorative dashes.
   - Write in plain, unformatted, direct human sentences.
3. KNOWLEDGE ACCURACY:
   - Ground technical gateway, mathematical, or nutritional facts in the DOCUMENTATION CONTEXT below.
   - If a specific detail is not in the context, be honest like a real person ("I don't have that exact detail on hand right now, but I can check with the team!").
4. MATHEMATICAL RIGOR & PURE MATHEMATICAL EXPRESSIONS:
   - When writing mathematical powers, exponents, and indices:
     * Write powers as pure mathematical expressions using Unicode superscripts and subscripts:
       Write Aⁿ, Aⁿ⁻¹, A², A³, A⁴, A⁻¹, cₙ₋₁, c₀ instead of carets (A^n) or dollar signs ($A^n$).
     * Present clean, rigorous step-by-step mathematical derivations without informal conversational filler.
     * Write clear algebraic equations without formatting stars:
       A² - 4A - 5I = 0
       ⇒ 5I = A² - 4A
       ⇒ 5A⁻¹ = A - 4I
       ⇒ A⁻¹ = ⅕(A - 4I)

=== DOCUMENTATION CONTEXT ===
${contextText}

=== CONVERSATION HISTORY ===
${historyText}

=== CUSTOMER QUESTION ===
${query}

Respond directly to the customer as Alex:`;

    // If Gemini is active, let the AI model respond with full human conversational intelligence
    if (this.isConfigured()) {
      try {
        let answerText = '';
        let usedModel = this.getModelName();
        let candidateModels = [
          'gemini-flash-lite-latest',
          'gemini-3.5-flash-lite',
          'gemini-3.1-flash-lite',
          this.getModelName(),
          'gemini-3.5-flash',
          'gemini-flash-latest'
        ];
        try {
          const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
          const listData = await listRes.json();
          if (listData.models && Array.isArray(listData.models)) {
            const available = listData.models
              .filter((m) => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
              .map((m) => m.name.replace('models/', ''))
              .filter((name) => !name.includes('tts') && !name.includes('audio') && !name.includes('image'));
            if (available.length > 0) {
              candidateModels = [...new Set([...candidateModels, ...available])];
            }
          }
        } catch (discoveryErr) {
          logger.debug(`Could not discover Google models: ${discoveryErr.message}`);
        }

        const genAI = new GoogleGenerativeAI(key);

        for (const candidate of candidateModels) {
          try {
            const modelInstance = genAI.getGenerativeModel({ model: candidate });
            const result = await modelInstance.generateContent(systemPrompt);
            let candidateText = result?.response?.text() || '';
            
            // Clean reasoning/thinking artifacts if emitted by thinking models
            candidateText = candidateText.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim();
            if (candidateText.startsWith('*   User') || candidateText.includes('\n*   Goal:')) {
              const paragraphs = candidateText.split(/\n\s*\n/);
              const cleanParagraphs = paragraphs.filter((p) => !p.trim().startsWith('*   ') && !p.trim().startsWith('-   ') && !p.trim().startsWith('Drafting:'));
              if (cleanParagraphs.length > 0) {
                candidateText = cleanParagraphs.join('\n\n').trim();
              }
            }

            if (candidateText && candidateText.trim().length > 0) {
              answerText = candidateText.trim();
              usedModel = candidate;
              this.modelName = candidate;
              break;
            }
          } catch (modelErr) {
            logger.warn(`Model ${candidate} failed (${modelErr.message}). Trying next candidate...`);
          }
        }

        if (answerText) {
          const finalFormattedAnswer = this.cleanHumanText(answerText.trim());
          return {
            answer: finalFormattedAnswer,
            model: usedModel,
            isAiGenerated: true,
            sources: relevantChunks.map((c) => ({
              id: c.id,
              documentTitle: c.documentTitle,
              similarity: parseFloat(c.similarity || 0).toFixed(3),
              snippet: c.content.slice(0, 150) + '...'
            }))
          };
        }
      } catch (err) {
        logger.error(`Gemini generation error: ${err.message}`);
      }
    }

    // Natural human fallback when GEMINI_API_KEY is not configured or offline
    // Check if query is completely off-topic without any domain overlap
    if (!isDomain && !hasOverlap) {
      const humanFallbacks = [
        `Haha, good question! 😄 Honestly, that's a bit outside my wheelhouse — I mainly help folks with WhatsApp messaging setups and healthy nutrition planning. Anything on those I can help you with?`,
        `Ah, wish I had a good answer for you on that one! 😊 My day-to-day focus is really on WhatsApp API integrations and diet/meal advice. Let me know if you need anything on those fronts!`,
        `Haha, I'm probably not the best person to ask about that! 😄 But if you have any questions around WhatsApp messaging, webhooks, or nutrition guidelines, I've got you covered!`
      ];
      const pickIdx = Math.abs(query.length + (query.charCodeAt(0) || 0)) % humanFallbacks.length;
      return {
        answer: humanFallbacks[pickIdx],
        model: 'human-fallback',
        isAiGenerated: false,
        sources: []
      };
    }

    // Natural human fallback when GEMINI_API_KEY is not configured or offline
    let fallbackAnswer = '';
    if (hasOverlap && relevantChunks.length > 0 && parseFloat(relevantChunks[0].similarity) > 0.04) {
      // Rerank top K chunks based on query content terms to select the most exact match
      const qWords = query.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
      const scoredChunks = [...relevantChunks].map((c) => {
        let score = parseFloat(c.similarity || 0);
        const content = (c.content || '').toLowerCase();
        for (const w of qWords) {
          if (content.includes(w)) score += 0.06;
          if (content.includes('non-' + w)) score -= 0.05; // Negation penalty
        }
        return { ...c, rerankScore: score };
      }).sort((a, b) => b.rerankScore - a.rerankScore);

      const topChunk = scoredChunks[0];
      let cleanContent = topChunk.content
        .replace(/^T\s+\/v1\//, 'POST /api/v1/')
        .trim();

      if (cleanContent.includes('## 6. Historical Figures')) {
        cleanContent = cleanContent.slice(cleanContent.indexOf('## 6. Historical Figures')).trim();
      }

      const isNutrition = (topChunk.documentTitle && topChunk.documentTitle.toLowerCase().includes('nutrition')) ||
                          topChunk.content.toLowerCase().includes('protein') ||
                          topChunk.content.toLowerCase().includes('diet') ||
                          topChunk.content.toLowerCase().includes('macronutrient');

      const intro = isNutrition
        ? `Hey there! 🥗 Here is the professional nutrition guidance on that:`
        : `Hey there! 👋 Here is the key info on that:`;

      const outro = isNutrition
        ? `_Hope this helps! Let me know if you would like a custom meal plan or more details!_ 😊`
        : `_Hope this helps! Let me know if you'd like an example or need more details on any part!_ 😊`;

      fallbackAnswer = `${intro}\n\n${cleanContent}\n\n${outro}`;
    } else {
      fallbackAnswer = `Hey there! 👋 Thanks for reaching out.\n\n` +
        `I've noted your question: "${query}". Our team is checking on this and will follow up with you shortly!\n\n` +
        `Let me know if there's anything else I can help with in the meantime. 😊`;
    }

    return {
      answer: fallbackAnswer,
      model: 'knowledge-base-direct',
      isAiGenerated: false,
      sources: relevantChunks.map((c) => ({
        id: c.id,
        documentTitle: c.documentTitle,
        similarity: parseFloat(c.similarity || 0).toFixed(3),
        snippet: c.content.slice(0, 150) + '...'
      }))
    };
  }

  /**
   * Seed the knowledge base with the initial documentation if empty
   */
  async autoSeedInitialDocs() {
    try {
      // 1. Seed WhatsApp Gateway docs if not present
      const gatewayDocCount = await db.KnowledgeDocument.count({
        where: {
          title: [
            'WhatsApp API Gateway Specification & Architecture',
            'WhatsApp API Gateway Support Guide'
          ]
        }
      });

      if (gatewayDocCount === 0) {
        const possiblePaths = [
          'C:\\Users\\Kaushik Aditya\\.gemini\\antigravity\\brain\\3d194093-19ee-4318-8d73-0637222e57bf\\.user_uploaded\\media_1790774638804.docx',
          path.resolve(process.cwd(), 'scratch/spec_clean.md'),
          'C:\\Users\\Kaushik Aditya\\.gemini\\antigravity\\brain\\3d194093-19ee-4318-8d73-0637222e57bf\\scratch\\spec_clean.md'
        ];

        let seeded = false;
        for (const p of possiblePaths) {
          if (fs.existsSync(p)) {
            const mime = p.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'text/markdown';
            logger.info(`Auto-seeding Knowledge Base with spec document from ${p}`);
            await this.ingestFile({
              filePath: p,
              originalName: 'WhatsApp_API_Gateway_Specification.docx',
              mimeType: mime,
              title: 'WhatsApp API Gateway Specification & Architecture'
            });
            seeded = true;
            break;
          }
        }

        if (!seeded) {
          const inlineSpecPath = path.resolve(process.cwd(), 'uploads/default_gateway_spec.md');
          if (!fs.existsSync(inlineSpecPath)) {
            fs.writeFileSync(
              inlineSpecPath,
              `# WhatsApp API Gateway Specification & Support Guide\n\nAuthentication, sending messages, webhooks, and rate limits.`,
              'utf-8'
            );
          }
          await this.ingestFile({
            filePath: inlineSpecPath,
            originalName: 'WhatsApp_API_Gateway_Guide.md',
            mimeType: 'text/markdown',
            title: 'WhatsApp API Gateway Support Guide'
          });
        }
      }

      // 2. Seed Food and Nutrition Guide if not present
      const nutritionDoc = await db.KnowledgeDocument.findOne({
        where: { title: 'Food and Nutrition Knowledge Guide' }
      });

      if (!nutritionDoc) {
        const nutritionPath = path.resolve(process.cwd(), 'uploads/food_and_nutrition_guide.md');
        if (fs.existsSync(nutritionPath)) {
          logger.info(`Auto-seeding Knowledge Base with Food and Nutrition Guide from ${nutritionPath}`);
          await this.ingestFile({
            filePath: nutritionPath,
            originalName: 'Food_and_Nutrition_Guide.md',
            mimeType: 'text/markdown',
            title: 'Food and Nutrition Knowledge Guide'
          });
        }
      }
    } catch (err) {
      logger.error('Error auto-seeding initial knowledge base:', err);
    }
  }
}

export const ragService = new RagService();
export default ragService;
