import React, { useState } from 'react';
import { Smartphone, Send, Webhook, Key, ShieldCheck, RefreshCw, Radio, Bot } from 'lucide-react';
import { getApiKey, setApiKey } from '../api';

export default function Navbar({
  activeTab,
  setActiveTab,
  sessions,
  activeSessionId,
  setActiveSessionId,
  isOnline,
  onRefresh
}) {
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(getApiKey());

  const handleSaveKey = (e) => {
    e.preventDefault();
    setApiKey(apiKeyInput.trim());
    setShowKeyModal(false);
    onRefresh();
  };

  const navItems = [
    { id: 'sessions', label: 'Sessions & QR', icon: Smartphone },
    { id: 'messages', label: 'Send & History', icon: Send },
    { id: 'rag', label: 'AI Bot & RAG', icon: Bot },
    { id: 'webhooks', label: 'Webhooks', icon: Webhook },
    { id: 'apikeys', label: 'API Keys', icon: Key },
  ];

  return (
    <>
      <header style={{
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-color)',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '64px',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        {/* Left: Brand + Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: 'var(--accent-wa)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#0b141a'
            }}>
              <Smartphone size={22} strokeWidth={2.5} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '16px', letterSpacing: '-0.3px' }}>
                WhatsApp Gateway
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Self-Hosted API & Webhooks
              </div>
            </div>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            borderRadius: '20px',
            fontSize: '12px',
            backgroundColor: isOnline ? 'rgba(37, 211, 102, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            color: isOnline ? '#25d366' : '#ef4444',
            border: `1px solid ${isOnline ? 'rgba(37, 211, 102, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
          }}>
            <Radio size={14} className={isOnline ? 'animate-pulse-slow' : ''} />
            <span>{isOnline ? 'Gateway Online' : 'Offline'}</span>
          </div>
        </div>

        {/* Center: Tabs */}
        <nav style={{ display: 'flex', gap: '6px' }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 500,
                  backgroundColor: isActive ? 'var(--bg-card)' : 'transparent',
                  color: isActive ? 'var(--accent-wa)' : 'var(--text-secondary)',
                  border: isActive ? '1px solid var(--border-light)' : '1px solid transparent'
                }}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right: Active Session Selector & API Key config */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {sessions.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Session:</span>
              <select
                value={activeSessionId || ''}
                onChange={(e) => setActiveSessionId(e.target.value)}
                style={{
                  padding: '6px 10px',
                  fontSize: '13px',
                  backgroundColor: 'var(--bg-card)',
                  borderColor: 'var(--border-light)'
                }}
              >
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id} ({s.status})
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={() => setShowKeyModal(true)}
            title="Configure Dashboard API Key"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '12px',
              backgroundColor: getApiKey() ? 'rgba(37, 211, 102, 0.1)' : 'var(--bg-input)',
              color: getApiKey() ? 'var(--accent-wa)' : 'var(--text-secondary)',
              border: '1px solid var(--border-light)'
            }}
          >
            <Key size={14} />
            <span>{getApiKey() ? 'Key Set' : 'Set API Key'}</span>
          </button>

          <button
            onClick={onRefresh}
            title="Refresh All Data"
            style={{
              padding: '8px',
              borderRadius: '8px',
              backgroundColor: 'var(--bg-card)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </header>

      {/* Modal for setting API key */}
      {showKeyModal && (
        <div className="modal-backdrop" onClick={() => setShowKeyModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)' }}>
              <h3 style={{ fontSize: '17px', fontWeight: 600 }}>Dashboard API Key</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Enter a raw API key (with admin or send scopes) to authorize requests sent through this dashboard.
              </p>
            </div>

            <form onSubmit={handleSaveKey} style={{ padding: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                API Key (Bearer Token)
              </label>
              <input
                type="text"
                placeholder="e.g. 81a7b3c2d4..."
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                style={{ width: '100%', marginBottom: '16px', fontFamily: 'monospace' }}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowKeyModal(false)}
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
                  Save Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
