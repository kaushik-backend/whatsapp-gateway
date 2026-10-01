import React, { useState, useEffect } from 'react';
import { 
  Bot, 
  Sparkles, 
  FileText, 
  Upload, 
  Trash2, 
  Search, 
  CheckCircle, 
  AlertCircle, 
  RefreshCw, 
  Layers, 
  Key, 
  Send, 
  Zap,
  MessageSquare
} from 'lucide-react';
import { api } from '../api';

export default function RagTab({ activeSessionId, sessions }) {
  // Settings State
  const [settings, setSettings] = useState({
    botEnabled: true,
    isConfigured: false,
    model: 'gemini-1.5-flash',
    hasGeminiApiKey: false,
    maskedKey: null
  });
  const [newApiKey, setNewApiKey] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  // Documents State
  const [documents, setDocuments] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [docTitle, setDocTitle] = useState('');
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // Test RAG Query State
  const [testQuery, setTestQuery] = useState('How does the gateway handle message retries and network drops?');
  const [queryLoading, setQueryLoading] = useState(false);
  const [ragResult, setRagResult] = useState(null);

  // Status Alerts
  const [alert, setAlert] = useState(null);

  const showAlert = (type, message) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 5000);
  };

  const loadSettings = async () => {
    try {
      const res = await api.getRagSettings(activeSessionId);
      if (res.data) setSettings(res.data);
    } catch (err) {
      console.error('Failed to load RAG settings:', err);
    }
  };

  const loadDocuments = async () => {
    setDocsLoading(true);
    try {
      const res = await api.getKnowledgeDocuments();
      setDocuments(res.data || []);
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      setDocsLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
    loadDocuments();
  }, [activeSessionId]);

  const handleToggleBot = async () => {
    setSavingSettings(true);
    try {
      const updated = !settings.botEnabled;
      await api.updateRagSettings({
        sessionId: activeSessionId || 'global',
        botEnabled: updated
      });
      setSettings((prev) => ({ ...prev, botEnabled: updated }));
      showAlert('success', `AI Auto-Reply Bot is now ${updated ? 'ENABLED' : 'DISABLED'}`);
    } catch (err) {
      showAlert('error', `Failed to update bot toggle: ${err.message}`);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveApiKey = async (e) => {
    e.preventDefault();
    if (!newApiKey.trim()) return;
    setSavingSettings(true);
    try {
      await api.updateRagSettings({ apiKey: newApiKey.trim() });
      showAlert('success', 'Gemini API Key successfully updated!');
      setNewApiKey('');
      loadSettings();
    } catch (err) {
      showAlert('error', `Failed to save API key: ${err.message}`);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleUploadDocument = async (e) => {
    e.preventDefault();
    if (!uploadFile) {
      showAlert('error', 'Please choose a document to upload (.pdf, .docx, .txt, .md)');
      return;
    }

    setUploadingDoc(true);
    const formData = new FormData();
    formData.append('file', uploadFile);
    if (docTitle.trim()) formData.append('title', docTitle.trim());

    try {
      const res = await api.uploadKnowledgeDocument(formData);
      showAlert('success', res.message || 'Document indexed into PGVector successfully!');
      setUploadFile(null);
      setDocTitle('');
      // Reset input
      const fileInput = document.getElementById('kb-file-input');
      if (fileInput) fileInput.value = '';
      loadDocuments();
    } catch (err) {
      showAlert('error', `Indexing failed: ${err.message}`);
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleDeleteDocument = async (docId) => {
    if (!confirm('Are you sure you want to delete this document from the knowledge base?')) return;
    try {
      await api.deleteKnowledgeDocument(docId);
      showAlert('success', 'Document and its vector chunks deleted');
      loadDocuments();
    } catch (err) {
      showAlert('error', `Failed to delete document: ${err.message}`);
    }
  };

  const handleTestQuery = async (e) => {
    e.preventDefault();
    if (!testQuery.trim()) return;

    setQueryLoading(true);
    setRagResult(null);
    try {
      const res = await api.queryKnowledgeBase({ query: testQuery.trim(), topK: 3 });
      setRagResult(res.data);
    } catch (err) {
      showAlert('error', `Query failed: ${err.message}`);
    } finally {
      setQueryLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Bot size={28} color="var(--accent-wa)" />
            AI Support Bot & RAG Knowledge Base
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            LangChain JS + PostgreSQL pgvector embeddings + Google Gemini 1.5 Flash automated customer support
          </p>
        </div>
        <button
          onClick={() => { loadSettings(); loadDocuments(); }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            fontSize: '13px'
          }}
        >
          <RefreshCw size={14} className={docsLoading ? 'spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Global Alert Notification */}
      {alert && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '20px',
          fontSize: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          backgroundColor: alert.type === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(37, 211, 102, 0.15)',
          color: alert.type === 'error' ? '#ef4444' : '#25d366',
          border: `1px solid ${alert.type === 'error' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(37, 211, 102, 0.3)'}`
        }}>
          {alert.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
          <span>{alert.message}</span>
        </div>
      )}

      {/* Top Cards: Bot Status & Gemini Setup */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '20px', marginBottom: '24px' }}>
        {/* Card 1: AI Bot Status */}
        <div style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '16px' }}>
                <Zap size={18} color="var(--accent-wa)" />
                <span>Auto-Reply Support Agent</span>
              </div>
              <span style={{
                padding: '4px 10px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 600,
                backgroundColor: settings.botEnabled ? 'rgba(37, 211, 102, 0.2)' : 'rgba(156, 163, 175, 0.2)',
                color: settings.botEnabled ? '#25d366' : '#9ca3af'
              }}>
                {settings.botEnabled ? 'ACTIVE' : 'PAUSED'}
              </span>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5', marginBottom: '16px' }}>
              When enabled, incoming customer messages on linked sessions are automatically answered using RAG context from your knowledge base with anti-spam pacing and human pause protection.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={handleToggleBot}
              disabled={savingSettings}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '13px',
                backgroundColor: settings.botEnabled ? '#ef4444' : 'var(--accent-wa)',
                color: '#fff',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              {settings.botEnabled ? 'Disable Auto-Reply Bot' : 'Enable Auto-Reply Bot'}
            </button>
          </div>
        </div>

        {/* Card 2: Gemini API Key & Model */}
        <div style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid var(--border-color)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '16px' }}>
              <Sparkles size={18} color="#60a5fa" />
              <span>Google Gemini 1.5 Flash</span>
            </div>
            <span style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '4px',
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-muted)'
            }}>
              Free Tier Available
            </span>
          </div>

          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            Current Status: {settings.hasGeminiApiKey ? (
              <strong style={{ color: '#25d366' }}>Connected ({settings.maskedKey})</strong>
            ) : (
              <span style={{ color: '#f59e0b' }}>Using local fallback. Set free Gemini API key to activate Flash 1.5.</span>
            )}
          </p>

          <form onSubmit={handleSaveApiKey} style={{ display: 'flex', gap: '8px' }}>
            <input
              type="password"
              placeholder="Paste Google AI Studio API Key..."
              value={newApiKey}
              onChange={(e) => setNewApiKey(e.target.value)}
              style={{ flex: 1, fontSize: '12px', padding: '8px 12px' }}
            />
            <button
              type="submit"
              disabled={savingSettings || !newApiKey.trim()}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                backgroundColor: 'var(--accent-wa)',
                color: '#fff',
                fontWeight: 600,
                fontSize: '12px',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              Save Key
            </button>
          </form>
          <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
            Get your free API key at <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-wa)' }}>Google AI Studio</a>.
          </div>
        </div>
      </div>

      {/* Main Grid: Knowledge Base Documents & Live RAG Query Tester */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Left Column: Knowledge Base Management */}
        <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={18} color="var(--accent-wa)" />
            <span>Indexed Knowledge Documents ({documents.length})</span>
          </h2>

          {/* Upload Form */}
          <form onSubmit={handleUploadDocument} style={{ marginBottom: '20px', padding: '14px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px' }}>Add Document to Vector Knowledge Base</div>
            <div style={{ marginBottom: '10px' }}>
              <input
                id="kb-file-input"
                type="file"
                accept=".pdf,.docx,.txt,.md"
                onChange={(e) => setUploadFile(e.target.files[0] || null)}
                style={{ width: '100%', fontSize: '12px' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="Optional document title..."
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                style={{ flex: 1, fontSize: '12px', padding: '6px 10px' }}
              />
              <button
                type="submit"
                disabled={uploadingDoc || !uploadFile}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  backgroundColor: 'var(--accent-wa)',
                  color: '#fff',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <Upload size={14} />
                <span>{uploadingDoc ? 'Indexing...' : 'Index File'}</span>
              </button>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: '6px' }}>
              Supports .pdf, .docx (Word), .txt, and .md files. Automatically parsed, chunked, and embedded into PostgreSQL.
            </span>
          </form>

          {/* Document List */}
          <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
            {documents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '13px' }}>
                No documents indexed yet. Upload a document above or click Refresh to view seeded docs.
              </div>
            ) : (
              documents.map((doc) => (
                <div
                  key={doc.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px',
                    backgroundColor: 'var(--bg-secondary)',
                    borderRadius: '8px',
                    marginBottom: '8px',
                    border: '1px solid var(--border-color)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <FileText size={20} color="var(--accent-wa)" />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '13px' }}>{doc.title}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {doc.totalChunks} vector chunks • {(doc.size / 1024).toFixed(1)} KB • {new Date(doc.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteDocument(doc.id)}
                    style={{
                      backgroundColor: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: '4px'
                    }}
                    title="Delete document"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Interactive RAG Query & Response Tester */}
        <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Search size={18} color="var(--accent-wa)" />
            <span>Interactive RAG Pipeline Inspector</span>
          </h2>

          <form onSubmit={handleTestQuery} style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Ask a question based on your indexed docs:
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
                placeholder="e.g. How does QR pairing work?"
                style={{ flex: 1, padding: '10px 14px', fontSize: '13px' }}
                required
              />
              <button
                type="submit"
                disabled={queryLoading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '10px 18px',
                  backgroundColor: 'var(--accent-wa)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                <Send size={15} />
                <span>{queryLoading ? 'Asking...' : 'Ask AI'}</span>
              </button>
            </div>
          </form>

          {/* Result Display */}
          {ragResult && (
            <div style={{ marginTop: '16px' }}>
              {/* AI Answer Bubble */}
              <div style={{
                backgroundColor: 'rgba(37, 211, 102, 0.08)',
                border: '1px solid rgba(37, 211, 102, 0.25)',
                borderRadius: '10px',
                padding: '16px',
                marginBottom: '16px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '13px', color: 'var(--accent-wa)' }}>
                    <Bot size={16} />
                    <span>AI Assistant Reply ({ragResult.model})</span>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {ragResult.isAiGenerated ? 'Gemini 1.5 Flash' : 'Documentation Match'}
                  </span>
                </div>
                <div style={{ fontSize: '14px', lineHeight: '1.6', whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>
                  {ragResult.answer}
                </div>
              </div>

              {/* Retrieved PGVector Chunks */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  Retrieved PGVector Chunks ({ragResult.sources?.length || 0}):
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                  {ragResult.sources?.map((s, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '10px 12px',
                        backgroundColor: 'var(--bg-secondary)',
                        borderRadius: '6px',
                        fontSize: '12px',
                        border: '1px solid var(--border-color)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, marginBottom: '4px', color: 'var(--text-primary)' }}>
                        <span>{s.documentTitle}</span>
                        <span style={{ color: 'var(--accent-wa)' }}>Similarity: {s.similarity}</span>
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                        "{s.snippet}"
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
