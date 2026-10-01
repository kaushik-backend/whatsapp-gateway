import React, { useState, useEffect } from 'react';
import { Webhook, Plus, Trash2, CheckCircle, AlertTriangle, ExternalLink, RotateCcw, X, Shield } from 'lucide-react';
import { api } from '../api';

export default function WebhooksTab({ activeSessionId }) {
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);

  // Form state
  const [targetUrl, setTargetUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [selectedEvents, setSelectedEvents] = useState(['message.received', 'message.status']);
  const [chatFilter, setChatFilter] = useState('');
  const [error, setError] = useState(null);

  // Deliveries modal
  const [selectedWebhookForDeliveries, setSelectedWebhookForDeliveries] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);

  const availableEvents = [
    { id: 'message.received', label: 'Inbound Customer Messages' },
    { id: 'message.status', label: 'Outbound Delivery & Read Receipts' },
    { id: 'session.status', label: 'Session Connection State Changes' },
    { id: 'reaction', label: 'Message Reactions' }
  ];

  const loadWebhooks = async () => {
    setLoading(true);
    try {
      const res = await api.getWebhooks(activeSessionId || undefined);
      setWebhooks(res.data || []);
    } catch (err) {
      console.error('Failed to load webhooks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWebhooks();
  }, [activeSessionId]);

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!activeSessionId) {
      setError('Please select an active session first.');
      return;
    }

    if (secret.length < 16) {
      setError('Webhook signing secret must be at least 16 characters.');
      return;
    }

    setError(null);
    try {
      await api.registerWebhook({
        sessionId: activeSessionId,
        url: targetUrl.trim(),
        secret: secret.trim(),
        events: selectedEvents,
        chatJids: chatFilter.trim() ? [chatFilter.trim()] : []
      });

      setShowRegisterModal(false);
      setTargetUrl('');
      setSecret('');
      loadWebhooks();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteWebhook = async (id) => {
    if (!window.confirm('Delete this webhook endpoint?')) return;
    try {
      await api.deleteWebhook(id);
      loadWebhooks();
    } catch (err) {
      alert(`Failed to delete webhook: ${err.message}`);
    }
  };

  const handleToggleActive = async (webhook) => {
    try {
      await api.updateWebhook(webhook.id, { active: !webhook.active });
      loadWebhooks();
    } catch (err) {
      alert(`Failed to update webhook: ${err.message}`);
    }
  };

  const openDeliveriesModal = async (webhook) => {
    setSelectedWebhookForDeliveries(webhook);
    setDeliveriesLoading(true);
    try {
      const res = await api.getWebhookDeliveries(webhook.id);
      setDeliveries(res.data?.deliveries || []);
    } catch (err) {
      alert(`Failed to fetch deliveries: ${err.message}`);
    } finally {
      setDeliveriesLoading(false);
    }
  };

  const handleRetryDelivery = async (deliveryId) => {
    try {
      await api.retryDelivery(deliveryId);
      // Reload deliveries
      const res = await api.getWebhookDeliveries(selectedWebhookForDeliveries.id);
      setDeliveries(res.data?.deliveries || []);
    } catch (err) {
      alert(`Retry failed: ${err.message}`);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 700 }}>Webhook Endpoints</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            HMAC-SHA256 signed event delivery to your internal webhooks and AI chatbot services.
          </p>
        </div>

        <button
          onClick={() => setShowRegisterModal(true)}
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
          <span>Register Webhook</span>
        </button>
      </div>

      {webhooks.length === 0 ? (
        <div style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          padding: '60px 20px',
          textAlign: 'center',
          color: 'var(--text-secondary)'
        }}>
          <Webhook size={48} style={{ opacity: 0.3, margin: '0 auto 16px' }} />
          <h3 style={{ fontSize: '18px', color: 'var(--text-primary)', marginBottom: '8px' }}>
            No Webhooks Registered
          </h3>
          <p style={{ fontSize: '14px', maxWidth: '440px', margin: '0 auto 20px' }}>
            Forward incoming WhatsApp messages directly to your servers or webhook testing URLs (like webhook.site).
          </p>
          <button
            onClick={() => setShowRegisterModal(true)}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              backgroundColor: 'var(--accent-wa)',
              color: '#0b141a',
              fontWeight: 600,
              fontSize: '14px'
            }}
          >
            Register First Webhook
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
          {webhooks.map((wh) => (
            <div
              key={wh.id}
              style={{
                backgroundColor: 'var(--bg-card)',
                borderRadius: '12px',
                border: '1px solid var(--border-light)',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Session: <strong>{wh.sessionId}</strong>
                  </div>
                  <span className={`badge ${wh.active ? 'badge-active' : 'badge-inactive'}`}>
                    {wh.active ? 'Active' : 'Paused'}
                  </span>
                </div>

                <div style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  wordBreak: 'break-all',
                  marginBottom: '14px',
                  color: 'var(--text-primary)'
                }}>
                  {wh.url}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px' }}>
                  {wh.events?.map((ev) => (
                    <span
                      key={ev}
                      style={{
                        padding: '2px 8px',
                        backgroundColor: 'var(--bg-input)',
                        borderRadius: '6px',
                        fontSize: '11px',
                        color: 'var(--accent-wa)'
                      }}
                    >
                      {ev}
                    </span>
                  ))}
                </div>

                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Secret: <span style={{ fontFamily: 'monospace' }}>••••••••••••••••</span>
                </div>
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: '20px',
                paddingTop: '16px',
                borderTop: '1px solid var(--border-color)'
              }}>
                <button
                  onClick={() => openDeliveriesModal(wh)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--bg-input)',
                    color: 'var(--text-primary)',
                    fontSize: '12px'
                  }}
                >
                  <ExternalLink size={14} />
                  <span>Deliveries & Logs</span>
                </button>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => handleToggleActive(wh)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '6px',
                      backgroundColor: 'var(--bg-input)',
                      color: 'var(--text-secondary)',
                      fontSize: '12px'
                    }}
                  >
                    {wh.active ? 'Pause' : 'Resume'}
                  </button>

                  <button
                    onClick={() => handleDeleteWebhook(wh.id)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      color: '#ef4444',
                      fontSize: '12px'
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Register Modal */}
      {showRegisterModal && (
        <div className="modal-backdrop" onClick={() => setShowRegisterModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '17px', fontWeight: 600 }}>Register Webhook Endpoint</h3>
              <button onClick={() => setShowRegisterModal(false)} style={{ background: 'transparent', color: 'var(--text-secondary)' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleRegister} style={{ padding: '20px' }}>
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

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  Webhook URL (POST target) *
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://webhook.site/your-id or https://api.yourdomain.com/webhook"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  HMAC Signing Secret (min 16 chars) *
                </label>
                <input
                  type="text"
                  required
                  minLength={16}
                  placeholder="super_secret_webhook_key_1234"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  style={{ width: '100%', fontFamily: 'monospace' }}
                />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px', display: 'block' }}>
                  The gateway signs every POST payload with <code>X-Signature: sha256=HMAC(secret, body)</code>.
                </span>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '8px', color: 'var(--text-secondary)' }}>
                  Subscribed Events *
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {availableEvents.map((ev) => {
                    const checked = selectedEvents.includes(ev.id);
                    return (
                      <label key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedEvents([...selectedEvents, ev.id]);
                            } else {
                              setSelectedEvents(selectedEvents.filter((id) => id !== ev.id));
                            }
                          }}
                        />
                        <span>{ev.label} (<code>{ev.id}</code>)</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  Chat JID Filter (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 919876543210@s.whatsapp.net (leave empty for all chats)"
                  value={chatFilter}
                  onChange={(e) => setChatFilter(e.target.value)}
                  style={{ width: '100%', fontSize: '12px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
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
                  Save Webhook
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deliveries Modal */}
      {selectedWebhookForDeliveries && (
        <div className="modal-backdrop" onClick={() => setSelectedWebhookForDeliveries(null)}>
          <div className="modal-content" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 600 }}>Delivery Log</h3>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px', wordBreak: 'break-all' }}>
                  {selectedWebhookForDeliveries.url}
                </div>
              </div>
              <button onClick={() => setSelectedWebhookForDeliveries(null)} style={{ background: 'transparent', color: 'var(--text-secondary)' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '20px', maxHeight: '420px', overflowY: 'auto' }}>
              {deliveriesLoading ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>
                  Loading deliveries...
                </div>
              ) : deliveries.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>
                  No event deliveries recorded yet for this webhook.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {deliveries.map((del) => (
                    <div
                      key={del.id}
                      style={{
                        padding: '12px',
                        backgroundColor: 'var(--bg-input)',
                        borderRadius: '8px',
                        border: '1px solid var(--border-light)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className={`badge badge-${del.status}`}>
                            {del.status}
                          </span>
                          <span style={{ fontSize: '12px', fontWeight: 600 }}>
                            {del.event}
                          </span>
                        </div>

                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          Attempt {del.attempts}/6 • {new Date(del.createdAt).toLocaleTimeString()}
                        </div>
                      </div>

                      {del.lastError && (
                        <div style={{ fontSize: '11px', color: '#f87171', marginTop: '4px' }}>
                          Error: {del.lastError} {del.lastStatusCode ? `(HTTP ${del.lastStatusCode})` : ''}
                        </div>
                      )}

                      {del.status !== 'delivered' && (
                        <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => handleRetryDelivery(del.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              backgroundColor: 'rgba(59, 130, 246, 0.15)',
                              color: '#60a5fa',
                              fontSize: '11px'
                            }}
                          >
                            <RotateCcw size={12} />
                            <span>Retry Dispatch</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
