import React, { useState, useEffect } from 'react';
import { Key, Plus, Trash2, Copy, Check, Shield, AlertCircle, X, CheckCircle } from 'lucide-react';
import { api, setApiKey, getApiKey } from '../api';

export default function ApiKeysTab({ onRefresh }) {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState(['admin', 'send', 'read', 'voice']);
  const [sessionRestriction, setSessionRestriction] = useState('');
  const [error, setError] = useState(null);

  // Raw key newly created
  const [newlyCreatedKey, setNewlyCreatedKey] = useState(null);
  const [copied, setCopied] = useState(false);

  const availableScopes = [
    { id: 'admin', label: 'Admin (Manage Keys, Sessions, Webhooks)' },
    { id: 'send', label: 'Send (Send WhatsApp Messages)' },
    { id: 'read', label: 'Read (Query Messages, Context, Logs)' },
    { id: 'voice', label: 'Voice (Send Voice Notes)' },
  ];

  const loadKeys = async () => {
    setLoading(true);
    try {
      const res = await api.getApiKeys();
      setKeys(res.data || []);
    } catch (err) {
      console.error('Failed to load API keys:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKeys();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await api.createApiKey({
        name: name.trim(),
        scopes,
        sessionIds: sessionRestriction.trim() ? [sessionRestriction.trim()] : []
      });

      setNewlyCreatedKey(res.data?.rawKey);
      setShowCreateModal(false);
      setName('');
      loadKeys();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRevoke = async (id) => {
    try {
      await api.revokeApiKey(id);
      loadKeys();
    } catch (err) {
      alert(`Failed to revoke key: ${err.message}`);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Permanently delete this API key?')) return;
    try {
      await api.deleteApiKey(id);
      loadKeys();
    } catch (err) {
      alert(`Failed to delete key: ${err.message}`);
    }
  };

  const handleCopyKey = () => {
    if (newlyCreatedKey) {
      navigator.clipboard.writeText(newlyCreatedKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleUseKeyInDashboard = (rawKey) => {
    setApiKey(rawKey);
    onRefresh();
    alert('Key set as the active Dashboard Bearer Token!');
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 700 }}>API Access Keys</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            Role-based API tokens for external integrations. Stored securely as SHA-256 hashes in PostgreSQL.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            borderRadius: '8px',
            backgroundColor: 'var(--accent-wa)',
            color: '#0b141a',
            fontWeight: 600,
            fontSize: '14px'
          }}
        >
          <Plus size={18} strokeWidth={2.5} />
          <span>Generate API Key</span>
        </button>
      </div>

      {/* Warning banner when a new key is generated */}
      {newlyCreatedKey && (
        <div style={{
          backgroundColor: 'rgba(37, 211, 102, 0.1)',
          border: '1px solid rgba(37, 211, 102, 0.3)',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '24px',
          animation: 'fadeIn 0.2s'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#25d366', fontWeight: 600, fontSize: '15px' }}>
            <CheckCircle size={18} />
            <span>New API Key Generated! Copy it now (shown once)</span>
          </div>

          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '8px 0 12px' }}>
            We only store the SHA-256 hash. If you lose this key, you will have to generate a new one.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input
              type="text"
              readOnly
              value={newlyCreatedKey}
              style={{
                flex: 1,
                fontFamily: 'monospace',
                backgroundColor: 'var(--bg-secondary)',
                fontSize: '13px',
                padding: '10px 14px'
              }}
            />
            <button
              onClick={handleCopyKey}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 16px',
                borderRadius: '8px',
                backgroundColor: 'var(--accent-wa)',
                color: '#0b141a',
                fontWeight: 600,
                fontSize: '13px'
              }}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              <span>{copied ? 'Copied!' : 'Copy Key'}</span>
            </button>
            <button
              onClick={() => handleUseKeyInDashboard(newlyCreatedKey)}
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                backgroundColor: 'var(--bg-input)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-light)',
                fontSize: '13px'
              }}
            >
              Use in Dashboard
            </button>
          </div>
        </div>
      )}

      {/* Keys List */}
      {keys.length === 0 ? (
        <div style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          padding: '60px 20px',
          textAlign: 'center',
          color: 'var(--text-secondary)'
        }}>
          <Key size={48} style={{ opacity: 0.3, margin: '0 auto 16px' }} />
          <h3 style={{ fontSize: '18px', color: 'var(--text-primary)', marginBottom: '8px' }}>
            No API Keys Generated
          </h3>
          <p style={{ fontSize: '14px', maxWidth: '420px', margin: '0 auto 20px' }}>
            Generate your first API key to authenticate external applications and secure your endpoints.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              backgroundColor: 'var(--accent-wa)',
              color: '#0b141a',
              fontWeight: 600,
              fontSize: '14px'
            }}
          >
            Generate Admin Key
          </button>
        </div>
      ) : (
        <div style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: '12px',
          border: '1px solid var(--border-light)',
          overflow: 'hidden'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                <th style={{ padding: '12px 16px' }}>Name</th>
                <th style={{ padding: '12px 16px' }}>Prefix</th>
                <th style={{ padding: '12px 16px' }}>Scopes</th>
                <th style={{ padding: '12px 16px' }}>Session Access</th>
                <th style={{ padding: '12px 16px' }}>Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '14px 16px', fontWeight: 600 }}>{k.name}</td>
                  <td style={{ padding: '14px 16px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                    {k.keyPrefix}••••••••
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {k.scopes?.map((sc) => (
                        <span
                          key={sc}
                          style={{
                            padding: '2px 8px',
                            backgroundColor: 'var(--bg-input)',
                            borderRadius: '4px',
                            fontSize: '11px',
                            color: 'var(--accent-wa)'
                          }}
                        >
                          {sc}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>
                    {k.sessionIds && k.sessionIds.length > 0 ? k.sessionIds.join(', ') : 'All Sessions'}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span className={`badge ${k.active ? 'badge-active' : 'badge-inactive'}`}>
                      {k.active ? 'Active' : 'Revoked'}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                      {k.active && (
                        <button
                          onClick={() => handleRevoke(k.id)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '6px',
                            backgroundColor: 'var(--bg-input)',
                            color: 'var(--text-secondary)',
                            fontSize: '12px'
                          }}
                        >
                          Revoke
                        </button>
                      )}

                      <button
                        onClick={() => handleDelete(k.id)}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '6px',
                          backgroundColor: 'rgba(239, 68, 68, 0.1)',
                          color: '#ef4444',
                          fontSize: '12px'
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Key Modal */}
      {showCreateModal && (
        <div className="modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '17px', fontWeight: 600 }}>Create New API Key</h3>
              <button onClick={() => setShowCreateModal(false)} style={{ background: 'transparent', color: 'var(--text-secondary)' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate} style={{ padding: '20px' }}>
              {error && (
                <div style={{
                  padding: '10px 14px',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  color: '#ef4444',
                  borderRadius: '8px',
                  fontSize: '13px',
                  marginBottom: '16px'
                }}>
                  {error}
                </div>
              )}

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  Key Name / Client App *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Master Admin, Zapier Integration, Node Backend"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '8px', color: 'var(--text-secondary)' }}>
                  Allowed Scopes *
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {availableScopes.map((sc) => {
                    const checked = scopes.includes(sc.id);
                    return (
                      <label key={sc.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setScopes([...scopes, sc.id]);
                            } else {
                              setScopes(scopes.filter((id) => id !== sc.id));
                            }
                          }}
                        />
                        <span>{sc.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  Restrict to Session ID (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. sales-1 (leave blank for unrestricted access to all sessions)"
                  value={sessionRestriction}
                  onChange={(e) => setSessionRestriction(e.target.value)}
                  style={{ width: '100%', fontSize: '12px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    backgroundColor: 'transparent',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border-light)'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '8px 18px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--accent-wa)',
                    color: '#0b141a',
                    fontWeight: 600
                  }}
                >
                  Generate Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
