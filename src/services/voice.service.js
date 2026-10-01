import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as googleTTS from 'google-tts-api';
import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../config/index.js';
import logger from '../utils/logger.js';

class VoiceService {
  constructor() {
    this.uploadDir = path.resolve(process.cwd(), 'uploads');
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }

    this.genAI = null;
    if (process.env.GEMINI_API_KEY) {
      this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    }
  }

  /**
   * Strip markdown syntax, LaTeX, and technical markers for human-like speech flow
   */
  cleanTextForSpeech(text) {
    if (!text || typeof text !== 'string') return '';

    return text
      // Remove code blocks
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`([^`]+)`/g, '$1')
      // Remove markdown links but keep anchor text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Remove headers, bold, italics, strikethrough, blockquotes
      .replace(/^[#>\s*+-]+/gm, '')
      .replace(/[*_~]/g, '')
      // Replace LaTeX symbols
      .replace(/\\lambda/g, 'lambda')
      .replace(/\\det/g, 'determinant')
      .replace(/\\nabla/g, 'del')
      .replace(/\\int/g, 'integral')
      .replace(/\$+/g, '')
      // Replace URLs
      .replace(/https?:\/\/\S+/g, 'link')
      // Remove emojis or special symbols that speech engines might garble
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Convert text into an audio file (MP3) suitable for WhatsApp voice messages (PTT)
   * @param {Object} options
   * @param {string} options.text - The response text to synthesize
   * @param {string} [options.lang='en'] - Speech language code
   * @returns {Promise<{ filename: string, url: string, filePath: string, size: number }>}
   */
  async synthesizeVoice({ text, lang = 'en' }) {
    const cleaned = this.cleanTextForSpeech(text);
    if (!cleaned) {
      throw new Error('No synthesizable text provided after cleaning');
    }

    // Limit text to ~800 characters to keep voice notes crisp, natural, and fast (under 40-50 seconds)
    const voiceText = cleaned.length > 800 ? cleaned.slice(0, 797) + '...' : cleaned;

    logger.info(`[VoiceService] Synthesizing speech (${voiceText.length} chars, lang: ${lang}): "${voiceText.slice(0, 60)}..."`);

    try {
      // google-tts-api automatically handles sentence splitting
      const chunks = await googleTTS.getAllAudioBase64(voiceText, {
        lang,
        slow: false,
        timeout: 10000,
        splitPunct: ',.?!'
      });

      if (!chunks || chunks.length === 0) {
        throw new Error('No audio chunks generated from TTS engine');
      }

      // Concatenate base64 audio frame buffers into a unified MP3
      const audioBuffers = chunks.map((chunk) => Buffer.from(chunk.base64, 'base64'));
      const combinedBuffer = Buffer.concat(audioBuffers);

      const filename = `voice-reply-${Date.now()}-${uuidv4().slice(0, 6)}.mp3`;
      const filePath = path.join(this.uploadDir, filename);

      await fs.promises.writeFile(filePath, combinedBuffer);

      logger.info(`[VoiceService] Voice audio generated successfully: ${filename} (${combinedBuffer.length} bytes)`);

      return {
        filename,
        url: `/uploads/${filename}`,
        filePath,
        size: combinedBuffer.length,
        text: voiceText
      };
    } catch (err) {
      logger.error(`[VoiceService] TTS synthesis failed: ${err.message}`, err);
      throw err;
    }
  }

  /**
   * Transcribe an incoming audio / voice note using Gemini multimodal audio
   * @param {Object} options
   * @param {Buffer|string} options.audio - Audio buffer or path to file
   * @param {string} [options.mimeType='audio/mp3'] - Mime type
   * @returns {Promise<string>} Transcribed text
   */
  async transcribeVoice({ audio, mimeType = 'audio/mp3' }) {
    if (!this.genAI && process.env.GEMINI_API_KEY) {
      this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    }

    if (!this.genAI) {
      logger.warn('[VoiceService] No GEMINI_API_KEY configured for voice transcription.');
      return '';
    }

    try {
      let base64Data = '';
      if (Buffer.isBuffer(audio)) {
        base64Data = audio.toString('base64');
      } else if (typeof audio === 'string') {
        const fullPath = audio.startsWith('/') || audio.startsWith('uploads')
          ? path.resolve(process.cwd(), audio.replace(/^\//, ''))
          : audio;
        base64Data = (await fs.promises.readFile(fullPath)).toString('base64');
      }

      if (!base64Data) {
        throw new Error('No audio data provided for transcription');
      }

      // Try fast models in order: gemini-flash-lite-latest -> gemini-3.5-flash
      const candidateModels = ['gemini-flash-lite-latest', 'gemini-3.5-flash', 'gemini-flash-latest'];
      let transcript = '';

      for (const modelName of candidateModels) {
        try {
          const model = this.genAI.getGenerativeModel({ model: modelName });
          const response = await model.generateContent([
            {
              inlineData: {
                mimeType,
                data: base64Data
              }
            },
            {
              text: 'Transcribe this spoken voice message accurately into plain text. Only return the exact transcription of the spoken words without preamble or formatting.'
            }
          ]);

          transcript = response.response.text().trim();
          if (transcript) {
            logger.info(`[VoiceService] Voice transcribed using ${modelName}: "${transcript}"`);
            break;
          }
        } catch (transcribeErr) {
          logger.warn(`[VoiceService] Model ${modelName} failed to transcribe: ${transcribeErr.message}. Trying next candidate.`);
        }
      }

      return transcript;
    } catch (err) {
      logger.error(`[VoiceService] Failed to transcribe voice audio: ${err.message}`, err);
      return '';
    }
  }
}

export const voiceService = new VoiceService();
export default voiceService;
