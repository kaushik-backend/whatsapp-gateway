import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, 
  Image, 
  FileText, 
  Mic, 
  Smile, 
  Clock, 
  CheckCheck, 
  Check, 
  AlertCircle, 
  RefreshCw, 
  MessageSquare,
  Upload,
  Square,
  Trash2,
  Radio,
  FileAudio,
  Sparkles,
  Volume2
} from 'lucide-react';
import { api } from '../api';

export default function MessagesTab({ activeSessionId, sessions }) {
  const [msgType, setMsgType] = useState('text'); // text, image, document, voice, react
  const [toPhone, setToPhone] = useState('');
  const [textContent, setTextContent] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [filename, setFilename] = useState('');
  const [mimetype, setMimetype] = useState('application/pdf');
  const [waMessageId, setWaMessageId] = useState('');
  const [emoji, setEmoji] = useState('👍');
  const [idempotencyKey, setIdempotencyKey] = useState('');

  // Media Upload & Mic Recording State
  const [mediaSource, setMediaSource] = useState('upload'); // 'upload' or 'url'
  const [voiceMode, setVoiceMode] = useState('tts'); // 'tts', 'record', 'upload', 'url'
  const [simulateType, setSimulateType] = useState('text'); // 'text' | 'voice'
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState(null);

  // Mic Recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedAudioBlob, setRecordedAudioBlob] = useState(null);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState(null);
  const mediaRecorderRef = useRef(null);
  const timerRef = useRef(null);
  const audioChunksRef = useRef([]);

  const [loading, setLoading] = useState(false);
  const [responseSuccess, setResponseSuccess] = useState(null);
  const [error, setError] = useState(null);

  // Message History
  const [messages, setMessages] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Chat Context inspector
  const [contextPhone, setContextPhone] = useState('');
  const [contextMessages, setContextMessages] = useState(null);
  const [contextLoading, setContextLoading] = useState(false);

  // Inbound simulation (safe sandbox test without real phone)
  const [simulatePhone, setSimulatePhone] = useState('919876543210');
  const [simulateText, setSimulateText] = useState('Hi, I am interested in your pricing!');
  const [simulateLoading, setSimulateLoading] = useState(false);
  const [simulateSuccess, setSimulateSuccess] = useState(null);

  const generateIdempotencyKey = () => {
    setIdempotencyKey(`msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`);
  };

  const loadMessages = async () => {
    if (!activeSessionId) return;
    setHistoryLoading(true);
    try {
      const res = await api.getMessages(activeSessionId, { limit: 25 });
      setMessages(res.data?.data || []);
    } catch (err) {
      console.error('Error fetching messages:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    loadMessages();
  }, [activeSessionId]);

  // Clean up recording timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl);
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    };
  }, []);

  const startRecording = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        setRecordedAudioBlob(blob);
        setRecordedAudioUrl(URL.createObjectURL(blob));
        // Stop audio tracks
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorderRef.current = recorder;
      recorder.start(100); // 100ms slice
      setIsRecording(true);
      setRecordingSeconds(0);

      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      setError(`Microphone access error: ${err.message}. Ensure mic permissions are granted.`);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const discardRecording = () => {
    if (isRecording) {
      stopRecording();
    }
    setRecordedAudioBlob(null);
    if (recordedAudioUrl) {
      URL.revokeObjectURL(recordedAudioUrl);
      setRecordedAudioUrl(null);
    }
    setRecordingSeconds(0);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0] || null;
    setSelectedFile(file);
    if (file) {
      if (file.type.startsWith('image/')) {
        setFilePreviewUrl(URL.createObjectURL(file));
      } else if (file.type.startsWith('audio/')) {
        setFilePreviewUrl(URL.createObjectURL(file));
      } else {
        setFilePreviewUrl(null);
      }
      if (!filename) setFilename(file.name);
      if (file.type) setMimetype(file.type);
    } else {
      setFilePreviewUrl(null);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!activeSessionId) {
      setError('Please select an active session first from the top navigation.');
      return;
    }

    setLoading(true);
    setError(null);
    setResponseSuccess(null);

    const to = toPhone.trim();
    const idemKey = idempotencyKey.trim() || undefined;

    try {
      let res;
      if (msgType === 'text') {
        res = await api.sendText(activeSessionId, { to, text: textContent, idempotencyKey: idemKey });
      } else if (msgType === 'image') {
        if (mediaSource === 'upload' && selectedFile) {
          const formData = new FormData();
          formData.append('file', selectedFile);
          formData.append('to', to);
          if (caption) formData.append('caption', caption);
          if (idemKey) formData.append('idempotencyKey', idemKey);
          res = await api.sendImageUpload(activeSessionId, formData);
        } else {
          res = await api.sendImage(activeSessionId, { to, url: mediaUrl, caption: caption || undefined, idempotencyKey: idemKey });
        }
      } else if (msgType === 'document') {
        if (mediaSource === 'upload' && selectedFile) {
          const formData = new FormData();
          formData.append('file', selectedFile);
          formData.append('to', to);
          if (idemKey) formData.append('idempotencyKey', idemKey);
          res = await api.sendDocumentUpload(activeSessionId, formData);
        } else {
          res = await api.sendDocument(activeSessionId, { to, url: mediaUrl, filename, mimetype, idempotencyKey: idemKey });
        }
      } else if (msgType === 'voice') {
        if (voiceMode === 'tts') {
          res = await api.sendVoiceSynthesize(activeSessionId, { to, text: textContent, idempotencyKey: idemKey });
        } else if (voiceMode === 'record' && recordedAudioBlob) {
          const formData = new FormData();
          formData.append('file', recordedAudioBlob, 'mic_voice_note.webm');
          formData.append('to', to);
          if (idemKey) formData.append('idempotencyKey', idemKey);
          res = await api.sendVoiceUpload(activeSessionId, formData);
        } else if (voiceMode === 'upload' && selectedFile) {
          const formData = new FormData();
          formData.append('file', selectedFile);
          formData.append('to', to);
          if (idemKey) formData.append('idempotencyKey', idemKey);
          res = await api.sendVoiceUpload(activeSessionId, formData);
        } else {
          res = await api.sendVoice(activeSessionId, { to, url: mediaUrl, idempotencyKey: idemKey });
        }
      } else if (msgType === 'react') {
        res = await api.sendReaction(activeSessionId, { to, waMessageId, emoji });
      }

      setResponseSuccess(res);
      // Clean up file/audio states
      discardRecording();
      setSelectedFile(null);
      setFilePreviewUrl(null);
      // Refresh outbox
      setTimeout(loadMessages, 1200);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFetchContext = async (e) => {
    e.preventDefault();
    if (!activeSessionId || !contextPhone.trim()) return;

    setContextLoading(true);
    try {
      const res = await api.getChatContext(activeSessionId, {
        chatJid: contextPhone.trim().includes('@') ? contextPhone.trim() : `${contextPhone.trim()}@s.whatsapp.net`,
        limit: 20
      });
      setContextMessages(res.data || []);
    } catch (err) {
      alert(`Failed to fetch context: ${err.message}`);
    } finally {
      setContextLoading(false);
    }
  };

  const handleSimulateIncoming = async (e) => {
    e.preventDefault();
    if (!activeSessionId) {
      alert('Please select an active session first.');
      return;
    }
    setSimulateLoading(true);
    setSimulateSuccess(null);
    try {
      const res = await api.simulateIncoming(activeSessionId, {
        from: simulatePhone.trim(),
        text: simulateText.trim(),
        type: simulateType
      });
      setSimulateSuccess(res.data);
      // Refresh messages history
      setTimeout(loadMessages, 800);
      // If contextPhone matches, auto-refresh context
      if (contextPhone && simulatePhone.includes(contextPhone)) {
        setTimeout(handleFetchContext, 800);
      }
    } catch (err) {
      alert(`Simulation failed: ${err.message}`);
    } finally {
      setSimulateLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 700 }}>Messaging & Outbox</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
          Send WhatsApp messages with anti-ban pacing, natural typing simulation, and queue resilience.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(380px, 480px) 1fr', gap: '24px' }}>
        {/* Left Column: Send Form */}
        <div style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: '12px',
          border: '1px solid var(--border-light)',
          padding: '24px',
          height: 'fit-content'
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Send size={18} color="var(--accent-wa)" />
            <span>Send New Message</span>
          </h3>

          {/* Type Selector Tabs */}
          <div style={{
            display: 'flex',
            backgroundColor: 'var(--bg-input)',
            padding: '4px',
            borderRadius: '8px',
            marginBottom: '20px'
          }}>
            {[
              { id: 'text', label: 'Text', icon: MessageSquare },
              { id: 'image', label: 'Image', icon: Image },
              { id: 'document', label: 'PDF / Doc', icon: FileText },
              { id: 'voice', label: 'Voice', icon: Mic },
              { id: 'react', label: 'React', icon: Smile },
            ].map((t) => {
              const Icon = t.icon;
              const isSelected = msgType === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setMsgType(t.id)}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    padding: '6px 8px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 500,
                    backgroundColor: isSelected ? 'var(--bg-card)' : 'transparent',
                    color: isSelected ? 'var(--accent-wa)' : 'var(--text-secondary)',
                    boxShadow: isSelected ? '0 1px 3px rgba(0,0,0,0.2)' : 'none'
                  }}
                >
                  <Icon size={14} />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>

          <form onSubmit={handleSendMessage}>
            {error && (
              <div style={{
                padding: '10px 14px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: '#ef4444',
                borderRadius: '8px',
                fontSize: '13px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            {responseSuccess && (
              <div style={{
                padding: '12px 14px',
                backgroundColor: 'rgba(37, 211, 102, 0.1)',
                color: '#25d366',
                borderRadius: '8px',
                fontSize: '13px',
                marginBottom: '16px',
                border: '1px solid rgba(37, 211, 102, 0.2)'
              }}>
                <div style={{ fontWeight: 600, marginBottom: '2px' }}>HTTP 202 Accepted!</div>
                <div>Message ID: #{responseSuccess.data?.id} (Status: {responseSuccess.data?.status})</div>
              </div>
            )}

            {/* Recipient */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                Recipient Phone (E.164, without + or spaces) *
              </label>
              <input
                type="text"
                placeholder="e.g. 919876543210"
                required
                value={toPhone}
                onChange={(e) => setToPhone(e.target.value)}
                style={{ width: '100%', fontFamily: 'monospace' }}
              />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px', display: 'block' }}>
                Normalized automatically to JID (e.g. 919876543210@s.whatsapp.net)
              </span>
            </div>

            {/* Dynamic fields by type */}
            {msgType === 'text' && (
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  Message Text (max 4096 chars) *
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="Type your WhatsApp message..."
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>
            )}

            {msgType === 'image' && (
              <>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                  <button
                    type="button"
                    onClick={() => { setMediaSource('upload'); setSelectedFile(null); setFilePreviewUrl(null); }}
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 500,
                      backgroundColor: mediaSource === 'upload' ? 'var(--accent-wa)' : 'var(--bg-secondary)',
                      color: mediaSource === 'upload' ? '#fff' : 'var(--text-secondary)',
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    Upload Image File
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMediaSource('url'); setSelectedFile(null); setFilePreviewUrl(null); }}
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 500,
                      backgroundColor: mediaSource === 'url' ? 'var(--accent-wa)' : 'var(--bg-secondary)',
                      color: mediaSource === 'url' ? '#fff' : 'var(--text-secondary)',
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    Provide Image URL
                  </button>
                </div>

                {mediaSource === 'upload' ? (
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                      Select Image (.png, .jpg, .webp) *
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      required={!selectedFile}
                      onChange={handleFileChange}
                      style={{ width: '100%', fontSize: '12px' }}
                    />
                    {filePreviewUrl && (
                      <div style={{ marginTop: '10px', textAlign: 'center', backgroundColor: 'var(--bg-secondary)', padding: '10px', borderRadius: '8px' }}>
                        <img src={filePreviewUrl} alt="Preview" style={{ maxHeight: '140px', maxWidth: '100%', borderRadius: '6px', objectFit: 'contain' }} />
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{selectedFile?.name} ({(selectedFile?.size / 1024).toFixed(1)} KB)</div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                      Image URL (publicly reachable) *
                    </label>
                    <input
                      type="url"
                      required
                      placeholder="https://example.com/banner.jpg"
                      value={mediaUrl}
                      onChange={(e) => setMediaUrl(e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </div>
                )}

                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                    Caption (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Check out our latest update!"
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
              </>
            )}

            {msgType === 'document' && (
              <>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                  <button
                    type="button"
                    onClick={() => { setMediaSource('upload'); setSelectedFile(null); }}
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 500,
                      backgroundColor: mediaSource === 'upload' ? 'var(--accent-wa)' : 'var(--bg-secondary)',
                      color: mediaSource === 'upload' ? '#fff' : 'var(--text-secondary)',
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    Upload Document File
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMediaSource('url'); setSelectedFile(null); }}
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 500,
                      backgroundColor: mediaSource === 'url' ? 'var(--accent-wa)' : 'var(--bg-secondary)',
                      color: mediaSource === 'url' ? '#fff' : 'var(--text-secondary)',
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    Provide Document URL
                  </button>
                </div>

                {mediaSource === 'upload' ? (
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                      Select Document (.pdf, .docx, .txt, .zip) *
                    </label>
                    <input
                      type="file"
                      required={!selectedFile}
                      onChange={handleFileChange}
                      style={{ width: '100%', fontSize: '12px' }}
                    />
                    {selectedFile && (
                      <div style={{ marginTop: '8px', padding: '8px 12px', backgroundColor: 'var(--bg-secondary)', borderRadius: '6px', fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FileText size={16} color="var(--accent-wa)" />
                        <span>{selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div style={{ marginBottom: '14px' }}>
                      <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                        Document / PDF URL *
                      </label>
                      <input
                        type="url"
                        required
                        placeholder="https://example.com/invoice.pdf"
                        value={mediaUrl}
                        onChange={(e) => setMediaUrl(e.target.value)}
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                          Filename *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="Invoice.pdf"
                          value={filename}
                          onChange={(e) => setFilename(e.target.value)}
                          style={{ width: '100%' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                          MIME Type *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="application/pdf"
                          value={mimetype}
                          onChange={(e) => setMimetype(e.target.value)}
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>
                  </>
                )}
              </>
            )}

            {msgType === 'voice' && (
              <div style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
                  {[
                    { id: 'tts', label: 'AI Voice (TTS)', icon: Sparkles },
                    { id: 'record', label: 'Mic Record', icon: Mic },
                    { id: 'upload', label: 'Upload Audio', icon: Upload },
                    { id: 'url', label: 'Audio URL', icon: Radio },
                  ].map((m) => {
                    const Icon = m.icon;
                    const isSel = voiceMode === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => { setVoiceMode(m.id); discardRecording(); setSelectedFile(null); }}
                        style={{
                          flex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px',
                          padding: '6px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 500,
                          backgroundColor: isSel ? 'var(--accent-wa)' : 'var(--bg-secondary)',
                          color: isSel ? '#fff' : 'var(--text-secondary)',
                          border: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        <Icon size={13} />
                        <span>{m.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Option 0: AI Voice Synthesis (Text-to-Speech) */}
                {voiceMode === 'tts' && (
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                      Spoken Message Script *
                    </label>
                    <textarea
                      required
                      rows={3}
                      placeholder="Type what the AI voice note should speak to the customer... (e.g. Hello! Thanks for contacting us. We'll be happy to assist you.)"
                      value={textContent}
                      onChange={(e) => setTextContent(e.target.value)}
                      style={{ width: '100%', marginBottom: '6px', fontSize: '13px' }}
                    />
                    <div style={{ fontSize: '11px', color: '#25d366', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Volume2 size={13} />
                      <span>Synthesizes real speech and sends as a WhatsApp Push-To-Talk voice note</span>
                    </div>
                  </div>
                )}

                {/* Option 1: Live Mic Recording */}
                {voiceMode === 'record' && (
                  <div style={{
                    padding: '16px',
                    backgroundColor: 'var(--bg-secondary)',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    textAlign: 'center'
                  }}>
                    {!isRecording && !recordedAudioUrl && (
                      <div>
                        <button
                          type="button"
                          onClick={startRecording}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '10px 20px',
                            backgroundColor: '#ef4444',
                            color: '#fff',
                            borderRadius: '24px',
                            border: 'none',
                            fontWeight: 600,
                            fontSize: '13px',
                            cursor: 'pointer',
                            boxShadow: '0 2px 8px rgba(239, 68, 68, 0.3)'
                          }}
                        >
                          <Mic size={18} />
                          <span>Start Recording Voice Note</span>
                        </button>
                        <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
                          Records directly from your microphone and sends as WhatsApp Voice Note (PTT)
                        </span>
                      </div>
                    )}

                    {isRecording && (
                      <div>
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '10px',
                          color: '#ef4444',
                          fontWeight: 700,
                          fontSize: '16px',
                          marginBottom: '12px'
                        }}>
                          <span style={{
                            display: 'inline-block',
                            width: '12px',
                            height: '12px',
                            borderRadius: '50%',
                            backgroundColor: '#ef4444',
                            animation: 'pulse 1s infinite'
                          }} />
                          <span>Recording: {String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:{String(recordingSeconds % 60).padStart(2, '0')}</span>
                        </div>
                        <div>
                          <button
                            type="button"
                            onClick={stopRecording}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '8px 18px',
                              backgroundColor: 'var(--text-primary)',
                              color: 'var(--bg-primary)',
                              borderRadius: '8px',
                              border: 'none',
                              fontWeight: 600,
                              fontSize: '12px',
                              cursor: 'pointer'
                            }}
                          >
                            <Square size={14} />
                            <span>Stop & Preview</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {recordedAudioUrl && (
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-wa)', marginBottom: '8px' }}>
                          Voice Note Recorded ({recordingSeconds}s)
                        </div>
                        <audio controls src={recordedAudioUrl} style={{ width: '100%', marginBottom: '10px' }} />
                        <button
                          type="button"
                          onClick={discardRecording}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 10px',
                            backgroundColor: 'transparent',
                            color: '#ef4444',
                            borderRadius: '6px',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            fontSize: '11px',
                            cursor: 'pointer'
                          }}
                        >
                          <Trash2 size={12} />
                          <span>Discard & Re-record</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Option 2: Upload Audio File */}
                {voiceMode === 'upload' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                      Select Audio File (.mp3, .ogg, .wav, .m4a, .webm) *
                    </label>
                    <input
                      type="file"
                      accept="audio/*"
                      required={!selectedFile}
                      onChange={handleFileChange}
                      style={{ width: '100%', fontSize: '12px' }}
                    />
                    {filePreviewUrl && (
                      <div style={{ marginTop: '10px', padding: '10px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>{selectedFile?.name} ({(selectedFile?.size / 1024).toFixed(1)} KB)</div>
                        <audio controls src={filePreviewUrl} style={{ width: '100%' }} />
                      </div>
                    )}
                  </div>
                )}

                {/* Option 3: Remote Audio URL */}
                {voiceMode === 'url' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                      Audio URL (MP3/OGG) *
                    </label>
                    <input
                      type="url"
                      required
                      placeholder="https://example.com/audio.mp3"
                      value={mediaUrl}
                      onChange={(e) => setMediaUrl(e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </div>
                )}
              </div>
            )}

            {msgType === 'react' && (
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                    Target Message WA ID *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="3EB0A1B2C3..."
                    value={waMessageId}
                    onChange={(e) => setWaMessageId(e.target.value)}
                    style={{ width: '100%', fontFamily: 'monospace' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                    Emoji *
                  </label>
                  <input
                    type="text"
                    required
                    value={emoji}
                    onChange={(e) => setEmoji(e.target.value)}
                    style={{ width: '100%', fontSize: '16px', textAlign: 'center' }}
                  />
                </div>
              </div>
            )}

            {/* Idempotency Key */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Idempotency Key (prevents duplicate sends)
                </label>
                <button
                  type="button"
                  onClick={generateIdempotencyKey}
                  style={{ background: 'transparent', color: 'var(--accent-wa)', fontSize: '12px' }}
                >
                  Generate Key
                </button>
              </div>
              <input
                type="text"
                placeholder="optional unique string"
                value={idempotencyKey}
                onChange={(e) => setIdempotencyKey(e.target.value)}
                style={{ width: '100%', fontFamily: 'monospace', fontSize: '12px' }}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !activeSessionId}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '11px',
                borderRadius: '8px',
                backgroundColor: 'var(--accent-wa)',
                color: '#0b141a',
                fontWeight: 600,
                fontSize: '14px',
                opacity: (!activeSessionId || loading) ? 0.6 : 1
              }}
            >
              <Send size={16} />
              <span>{loading ? 'Queuing Send...' : 'Send WhatsApp Message'}</span>
            </button>
          </form>
        </div>

        {/* Right Column: Message History & Context Inspector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* History Card */}
          <div style={{
            backgroundColor: 'var(--bg-card)',
            borderRadius: '12px',
            border: '1px solid var(--border-light)',
            padding: '20px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={16} color="var(--accent-wa)" />
                <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Outbox & Recent Activity</h3>
              </div>
              <button
                onClick={loadMessages}
                style={{
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '12px'
                }}
              >
                <RefreshCw size={13} className={historyLoading ? 'animate-spin' : ''} />
                <span>Refresh</span>
              </button>
            </div>

            {messages.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)', fontSize: '13px' }}>
                No messages found for session "{activeSessionId || 'none'}"
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                      <th style={{ padding: '8px 12px' }}>Status</th>
                      <th style={{ padding: '8px 12px' }}>To / Chat</th>
                      <th style={{ padding: '8px 12px' }}>Type</th>
                      <th style={{ padding: '8px 12px' }}>Content</th>
                      <th style={{ padding: '8px 12px' }}>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {messages.map((m) => {
                      const textPreview = m.body?.text || m.body?.caption || (m.body?.emoji ? `Emoji: ${m.body.emoji}` : JSON.stringify(m.body));
                      return (
                        <tr key={m.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '10px 12px' }}>
                            <span className={`badge badge-${m.status}`}>
                              {m.status === 'delivered' && <CheckCheck size={12} />}
                              {m.status === 'sent' && <Check size={12} />}
                              {m.status}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: '12px' }}>
                            {m.chatJid?.split('@')[0]}
                          </td>
                          <td style={{ padding: '10px 12px', textTransform: 'capitalize' }}>
                            {m.type}
                          </td>
                          <td style={{ padding: '10px 12px', minWidth: '220px' }}>
                            {m.type === 'voice' ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {m.body?.url && (
                                  <audio
                                    controls
                                    src={m.body.url}
                                    style={{ height: '28px', maxWidth: '200px' }}
                                  />
                                )}
                                {m.body?.text && (
                                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    🎙️ {m.body.text}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span style={{ maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                                {textPreview}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                            {new Date(Number(m.timestamp)).toLocaleTimeString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* AI Chat Context Inspector Card */}
          <div style={{
            backgroundColor: 'var(--bg-card)',
            borderRadius: '12px',
            border: '1px solid var(--border-light)',
            padding: '20px'
          }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>
              AI Chat Context Inspector
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
              Preview the recent history passed to your AI bot or webhook receiver (<code>/messages/context/chat</code>).
            </p>

            <form onSubmit={handleFetchContext} style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
              <input
                type="text"
                placeholder="Phone number e.g. 919876543210"
                value={contextPhone}
                onChange={(e) => setContextPhone(e.target.value)}
                style={{ flex: 1, fontSize: '13px' }}
              />
              <button
                type="submit"
                disabled={contextLoading || !contextPhone.trim()}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--bg-input)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-light)',
                  fontSize: '13px'
                }}
              >
                {contextLoading ? 'Fetching...' : 'Inspect Context'}
              </button>
            </form>

            {contextMessages && (
              <div style={{
                backgroundColor: 'var(--bg-secondary)',
                borderRadius: '8px',
                padding: '12px',
                maxHeight: '220px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                {contextMessages.length === 0 ? (
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center' }}>
                    No prior conversation history found for this number.
                  </div>
                ) : (
                  contextMessages.map((msg, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        maxWidth: '85%',
                        alignSelf: msg.fromMe ? 'flex-end' : 'flex-start',
                        backgroundColor: msg.fromMe ? 'rgba(37, 211, 102, 0.2)' : 'var(--bg-input)',
                        color: 'var(--text-primary)'
                      }}
                    >
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                        {msg.fromMe ? 'Gateway (You)' : 'Customer'} • {new Date(Number(msg.timestamp)).toLocaleTimeString()}
                      </div>
                      <div>{msg.body?.text || JSON.stringify(msg.body)}</div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Zero-Risk Inbound Simulator Card */}
          <div style={{
            backgroundColor: 'var(--bg-card)',
            borderRadius: '12px',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            padding: '20px',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span className="badge" style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa' }}>
                Safe Sandbox
              </span>
              <h3 style={{ fontSize: '15px', fontWeight: 600 }}>
                Simulate Customer Reply (Zero Ban Risk)
              </h3>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
              Test your inbound message pipeline, webhook dispatchers, and AI bot responses without sending to or from a real phone number.
            </p>

            <form onSubmit={handleSimulateIncoming}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <button
                  type="button"
                  onClick={() => setSimulateType('text')}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    backgroundColor: simulateType === 'text' ? 'var(--accent-wa)' : 'var(--bg-secondary)',
                    color: simulateType === 'text' ? '#0b141a' : 'var(--text-secondary)',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  💬 Text Message
                </button>
                <button
                  type="button"
                  onClick={() => setSimulateType('voice')}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    backgroundColor: simulateType === 'voice' ? 'var(--accent-wa)' : 'var(--bg-secondary)',
                    color: simulateType === 'voice' ? '#0b141a' : 'var(--text-secondary)',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  🎙️ Voice Note (PTT)
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px', marginBottom: '10px' }}>
                <input
                  type="text"
                  placeholder="Customer Phone"
                  value={simulatePhone}
                  onChange={(e) => setSimulatePhone(e.target.value)}
                  style={{ fontSize: '13px' }}
                />
                <input
                  type="text"
                  placeholder={simulateType === 'voice' ? "What customer speaks in the voice note..." : "Simulated message text..."}
                  value={simulateText}
                  onChange={(e) => setSimulateText(e.target.value)}
                  style={{ fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Triggers <code>message.received</code> webhook + persists in PostgreSQL
                </span>

                <button
                  type="submit"
                  disabled={simulateLoading || !activeSessionId}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                    color: '#60a5fa',
                    border: '1px solid rgba(59, 130, 246, 0.4)',
                    fontSize: '13px',
                    fontWeight: 500
                  }}
                >
                  {simulateLoading ? 'Injecting...' : 'Inject Customer Reply'}
                </button>
              </div>

              {simulateSuccess && (
                <div style={{ marginTop: '10px', fontSize: '12px', color: '#25d366' }}>
                  ✓ Inbound message received and forwarded to webhooks! (WA ID: {simulateSuccess.waMessageId})
                </div>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
