import React, { useState, useEffect } from 'react';
import { QrCode, Plus, Trash2, Smartphone, CheckCircle, AlertCircle, RefreshCw, X, Shield, ShieldCheck, Lock, UserCheck, UserX } from 'lucide-react';
import { api } from '../api';


export default function SessionsTab({ sessions, onRefresh, activeSessionId, setActiveSessionId }) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSessionId, setNewSessionId] = useState('');
  const [newSessionName, setNewSessionName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // QR Modal
  const [qrModalSessionId, setQrModalSessionId] = useState(null);
  const [qrUrl, setQrUrl] = useState('');
  const [qrLoading, setQrLoading] = useState(false);

  const handleCreateSession = async (e) => {
    e.preventDefault();
    if (!newSessionId.trim()) return;

    setLoading(true);
    setError(null);
    try {
      await api.createSession(newSessionId.trim(), newSessionName.trim() || undefined);
      setShowCreateModal(false);
      setNewSessionId('');
      setNewSessionName('');
      onRefresh();
      // Open QR modal right away
      openQrModal(newSessionId.trim());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSession = async (id) => {
    if (!window.confirm(`Are you sure you want to log out and delete session "${id}"?`)) return;
    try {
      await api.deleteSession(id);
      onRefresh();
      if (qrModalSessionId === id) {
        closeQrModal();
      }
    } catch (err) {
      alert(`Failed to delete session: ${err.message}`);
    }
  };

  const openQrModal = (sessionId) => {
    setQrModalSessionId(sessionId);
    setQrUrl(api.getQRPngUrl(sessionId));
  };

  const closeQrModal = () => {
    setQrModalSessionId(null);
    setQrUrl('');
  };

  const refreshQr = () => {
    if (qrModalSessionId) {
      setQrLoading(true);
      setQrUrl(api.getQRPngUrl(qrModalSessionId));
      setTimeout(() => setQrLoading(false), 500);
    }
  };

  const currentModalSession = sessions.find((s) => s.id === qrModalSessionId);
  const isModalSessionConnected = currentModalSession?.status === 'connected';

  // Auto refresh session state and QR while modal is open
  useEffect(() => {
    if (!qrModalSessionId) return;

    // Fast check on session status so when user scans on phone, UI immediately updates
    const interval = setInterval(() => {
      onRefresh();
      // Only refresh QR image if not yet connected
      const sess = sessions.find((s) => s.id === qrModalSessionId);
      if (!sess || sess.status !== 'connected') {
        setQrUrl(api.getQRPngUrl(qrModalSessionId));
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [qrModalSessionId, sessions]);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px'
      }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 700 }}>WhatsApp Sessions</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            Manage linked phone numbers and pairing QR codes. Auth credentials persist across server restarts.
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
          <span>New Session</span>
        </button>
      </div>

      {/* Grid of Sessions */}
      {sessions.length === 0 ? (
        <div style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          padding: '60px 20px',
          textAlign: 'center',
          color: 'var(--text-secondary)'
        }}>
          <Smartphone size={48} style={{ opacity: 0.3, margin: '0 auto 16px' }} />
          <h3 style={{ fontSize: '18px', color: 'var(--text-primary)', marginBottom: '8px' }}>
            No WhatsApp Sessions Yet
          </h3>
          <p style={{ fontSize: '14px', maxWidth: '420px', margin: '0 auto 20px' }}>
            Create your first session with an identifier like "sales-1" or "support-1" to generate a pairing QR code.
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
            Create First Session
          </button>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: '20px'
        }}>
          {sessions.map((session) => {
            const isSelected = activeSessionId === session.id;
            return (
              <div
                key={session.id}
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderRadius: '12px',
                  border: `1px solid ${isSelected ? 'var(--accent-wa)' : 'var(--border-light)'}`,
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: isSelected ? '0 0 0 1px var(--accent-wa)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: 600 }}>{session.id}</div>
                      {session.name && (
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          {session.name}
                        </div>
                      )}
                    </div>

                    <span className={`badge badge-${session.status}`}>
                      {session.status === 'connected' && <CheckCircle size={13} />}
                      {session.status === 'qr' && <QrCode size={13} />}
                      {session.status}
                    </span>
                  </div>

                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Phone:</span>
                      <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                        {session.phoneNumber || 'Not linked yet'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Created:</span>
                      <span>{new Date(session.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <div style={{
                  display: 'flex',
                  gap: '10px',
                  marginTop: '20px',
                  paddingTop: '16px',
                  borderTop: '1px solid var(--border-color)'
                }}>
                  {session.status !== 'connected' && (
                    <button
                      onClick={() => openQrModal(session.id)}
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        backgroundColor: 'var(--bg-input)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-light)',
                        fontSize: '13px',
                        fontWeight: 500
                      }}
                    >
                      <QrCode size={16} />
                      <span>Pair Phone (QR)</span>
                    </button>
                  )}

                  <button
                    onClick={() => setActiveSessionId(session.id)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '8px',
                      backgroundColor: isSelected ? 'rgba(37, 211, 102, 0.15)' : 'var(--bg-input)',
                      color: isSelected ? 'var(--accent-wa)' : 'var(--text-secondary)',
                      border: '1px solid var(--border-light)',
                      fontSize: '13px'
                    }}
                  >
                    {isSelected ? 'Active' : 'Select'}
                  </button>

                  <button
                    onClick={() => handleDeleteSession(session.id)}
                    title="Disconnect and Delete Session"
                    style={{
                      padding: '8px',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      color: '#ef4444',
                      border: '1px solid rgba(239, 68, 68, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Privacy & Contact Isolation Card for Selected Session */}
      {activeSessionId && (
        <PrivacySettingsCard sessionId={activeSessionId} />
      )}



      {/* Modal: Create Session */}
      {showCreateModal && (
        <div className="modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '17px', fontWeight: 600 }}>Create New Session</h3>
              <button onClick={() => setShowCreateModal(false)} style={{ background: 'transparent', color: 'var(--text-secondary)' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSession} style={{ padding: '20px' }}>
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

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  Session ID (e.g. sales-1, support-line) *
                </label>
                <input
                  type="text"
                  placeholder="sales-1"
                  required
                  value={newSessionId}
                  onChange={(e) => setNewSessionId(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  Display Name (optional)
                </label>
                <input
                  type="text"
                  placeholder="Primary Sales WhatsApp"
                  value={newSessionName}
                  onChange={(e) => setNewSessionName(e.target.value)}
                  style={{ width: '100%' }}
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
                  disabled={loading}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--accent-wa)',
                    color: '#0b141a',
                    fontWeight: 600
                  }}
                >
                  {loading ? 'Starting...' : 'Create & Show QR'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Live QR Code Scanner */}
      {qrModalSessionId && (
        <div className="modal-backdrop" onClick={closeQrModal}>
          <div className="modal-content" style={{ maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 600 }}>Link Device: {qrModalSessionId}</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Auto-refreshes every few seconds
                </p>
              </div>
              <button onClick={closeQrModal} style={{ background: 'transparent', color: 'var(--text-secondary)' }}>
                <X size={18} />
              </button>
            </div>

            {isModalSessionConnected ? (
              <div style={{ padding: '36px 20px', textAlign: 'center' }}>
                <div style={{
                  width: '68px',
                  height: '68px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(37, 211, 102, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                  color: 'var(--accent-wa)'
                }}>
                  <CheckCircle size={40} />
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Device Linked Successfully!
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                  Session <strong>{qrModalSessionId}</strong> is active and connected to WhatsApp.
                </p>
                {currentModalSession?.phoneNumber && (
                  <div style={{
                    display: 'inline-block',
                    backgroundColor: 'var(--bg-input)',
                    padding: '6px 16px',
                    borderRadius: '20px',
                    fontFamily: 'monospace',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    marginBottom: '24px',
                    border: '1px solid var(--border-light)'
                  }}>
                    +{currentModalSession.phoneNumber}
                  </div>
                )}
                <div>
                  <button
                    onClick={() => {
                      closeQrModal();
                      onRefresh();
                    }}
                    style={{
                      padding: '10px 28px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--accent-wa)',
                      color: '#0b141a',
                      fontWeight: 600,
                      fontSize: '14px'
                    }}
                  >
                    Done &amp; Close
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ padding: '24px', textAlign: 'center' }}>
                <div style={{
                  backgroundColor: '#ffffff',
                  padding: '16px',
                  borderRadius: '12px',
                  display: 'inline-block',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                  position: 'relative',
                  minWidth: '240px',
                  minHeight: '240px'
                }}>
                  <img
                    src={qrUrl}
                    alt="WhatsApp Pairing QR Code"
                    style={{ width: '220px', height: '220px', display: 'block' }}
                    onError={(e) => {
                      // QR might still be booting up
                    }}
                  />
                </div>

                {/* Instructions */}
                <div style={{
                  marginTop: '20px',
                  textAlign: 'left',
                  backgroundColor: 'var(--bg-input)',
                  borderRadius: '8px',
                  padding: '14px',
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.6
                }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                    To pair your phone:
                  </div>
                  <ol style={{ paddingLeft: '18px' }}>
                    <li>Open <strong>WhatsApp</strong> on your phone</li>
                    <li>Tap <strong>Settings</strong> &gt; <strong>Linked Devices</strong></li>
                    <li>Tap <strong>Link a Device</strong></li>
                    <li>Point your camera at this QR code</li>
                  </ol>
                </div>

                <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'center', gap: '10px' }}>
                  <button
                    onClick={refreshQr}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--bg-input)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-light)',
                      fontSize: '13px'
                    }}
                  >
                    <RefreshCw size={14} className={qrLoading ? 'animate-spin' : ''} />
                    <span>Refresh QR</span>
                  </button>

                  <button
                    onClick={() => {
                      closeQrModal();
                      onRefresh();
                    }}
                    style={{
                      padding: '8px 18px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--accent-wa)',
                      color: '#0b141a',
                      fontWeight: 600,
                      fontSize: '13px'
                    }}
                  >
                    Done Scanning
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PrivacySettingsCard({ sessionId }) {
  const [config, setConfig] = useState({
    mode: 'target_only',
    allowedContacts: [],
    ignoreGroups: true,
    ignoreBroadcasts: true
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newContact, setNewContact] = useState('');
  const [statusMsg, setStatusMsg] = useState(null);

  const fetchPrivacy = async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const res = await api.getSessionPrivacy(sessionId);
      if (res?.data) {
        setConfig(res.data);
      }
    } catch (err) {
      console.warn('Could not load privacy config:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrivacy();
  }, [sessionId]);

  const handleModeChange = async (newMode) => {
    setSaving(true);
    setStatusMsg(null);
    try {
      const res = await api.updateSessionPrivacy(sessionId, { mode: newMode });
      if (res?.data) {
        setConfig(res.data);
        setStatusMsg('Privacy mode updated');
        setTimeout(() => setStatusMsg(null), 3000);
      }
    } catch (err) {
      alert(`Failed to update mode: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleGroups = async (val) => {
    setSaving(true);
    try {
      const res = await api.updateSessionPrivacy(sessionId, { ignoreGroups: val });
      if (res?.data) setConfig(res.data);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddContact = async (e) => {
    e.preventDefault();
    if (!newContact.trim()) return;
    setSaving(true);
    try {
      const res = await api.addAllowedPrivacyContact(sessionId, newContact.trim());
      if (res?.data) {
        setConfig(res.data);
        setNewContact('');
        setStatusMsg('Contact added to whitelist');
        setTimeout(() => setStatusMsg(null), 3000);
      }
    } catch (err) {
      alert(`Failed to add contact: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveContact = async (contact) => {
    setSaving(true);
    try {
      const res = await api.removeAllowedPrivacyContact(sessionId, contact);
      if (res?.data) {
        setConfig(res.data);
        setStatusMsg('Contact removed');
        setTimeout(() => setStatusMsg(null), 3000);
      }
    } catch (err) {
      alert(`Failed to remove contact: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      marginTop: '36px',
      backgroundColor: 'var(--bg-card)',
      borderRadius: '12px',
      border: '1px solid var(--border-color)',
      padding: '24px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            backgroundColor: 'rgba(37, 211, 102, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent-wa)'
          }}>
            <ShieldCheck size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: '17px', fontWeight: 600 }}>
              Contact Privacy &amp; Zero-Spill Isolation (Session: {sessionId})
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '2px' }}>
              Ensure personal WhatsApp contacts from your phone contact list are filtered out and hidden from the admin.
            </p>
          </div>
        </div>

        {statusMsg && (
          <span style={{ fontSize: '12px', color: 'var(--accent-wa)', fontWeight: 600 }}>
            {statusMsg}
          </span>
        )}
      </div>

      <div style={{
        padding: '12px 16px',
        borderRadius: '8px',
        backgroundColor: 'rgba(59, 130, 246, 0.08)',
        border: '1px solid rgba(59, 130, 246, 0.2)',
        fontSize: '13px',
        color: 'var(--text-primary)',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px'
      }}>
        <Lock size={16} style={{ color: '#3b82f6', marginTop: '2px', flexShrink: 0 }} />
        <div>
          <strong>Strict Privacy Boundary:</strong> Incoming messages from personal/family contacts in your phone list will be intercepted at the gateway boundary. They are <strong>never stored in PostgreSQL</strong>, <strong>never sent to webhooks</strong>, and <strong>never visible in the dashboard</strong>.
        </div>
      </div>

      {/* Mode Selection */}
      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>
          Isolation Mode
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
          <div
            onClick={() => handleModeChange('target_only')}
            style={{
              padding: '14px',
              borderRadius: '8px',
              border: `1px solid ${config.mode === 'target_only' ? 'var(--accent-wa)' : 'var(--border-light)'}`,
              backgroundColor: config.mode === 'target_only' ? 'rgba(37, 211, 102, 0.08)' : 'var(--bg-input)',
              cursor: 'pointer'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '14px' }}>
              <UserCheck size={16} color={config.mode === 'target_only' ? 'var(--accent-wa)' : 'inherit'} />
              <span>Target Contact Only (Strict)</span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Admin only sees conversations with designated whitelisted numbers below. All other personal messages are dropped.
            </p>
          </div>

          <div
            onClick={() => handleModeChange('gateway_only')}
            style={{
              padding: '14px',
              borderRadius: '8px',
              border: `1px solid ${config.mode === 'gateway_only' ? 'var(--accent-wa)' : 'var(--border-light)'}`,
              backgroundColor: config.mode === 'gateway_only' ? 'rgba(37, 211, 102, 0.08)' : 'var(--bg-input)',
              cursor: 'pointer'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '14px' }}>
              <Shield size={16} color={config.mode === 'gateway_only' ? 'var(--accent-wa)' : 'inherit'} />
              <span>Gateway-Initiated Only</span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Only contacts that the admin or gateway has actively messaged or whitelisted can talk to the gateway.
            </p>
          </div>

          <div
            onClick={() => handleModeChange('all')}
            style={{
              padding: '14px',
              borderRadius: '8px',
              border: `1px solid ${config.mode === 'all' ? 'var(--accent-wa)' : 'var(--border-light)'}`,
              backgroundColor: config.mode === 'all' ? 'rgba(37, 211, 102, 0.08)' : 'var(--bg-input)',
              cursor: 'pointer'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '14px' }}>
              <UserX size={16} color={config.mode === 'all' ? 'var(--accent-wa)' : 'inherit'} />
              <span>All Messages (Unrestricted)</span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Capture all inbound WhatsApp messages regardless of sender.
            </p>
          </div>
        </div>
      </div>

      {/* Allowed Contacts Whitelist */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>
          Designated Allowed Contacts (Whitelist)
        </label>

        <form onSubmit={handleAddContact} style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
          <input
            type="text"
            placeholder="e.g. +919876543210 or 919876543210@s.whatsapp.net"
            value={newContact}
            onChange={(e) => setNewContact(e.target.value)}
            style={{ flex: 1 }}
          />
          <button
            type="submit"
            disabled={saving || !newContact.trim()}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              backgroundColor: 'var(--accent-wa)',
              color: '#0b141a',
              fontWeight: 600,
              fontSize: '13px'
            }}
          >
            Add Allowed Contact
          </button>
        </form>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {(config.allowedContacts || []).length === 0 ? (
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
              No specific numbers whitelisted yet. (Gateway-initiated conversations will still be captured in gateway mode).
            </div>
          ) : (
            config.allowedContacts.map((contact) => (
              <span
                key={contact}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-light)',
                  padding: '4px 10px',
                  borderRadius: '20px',
                  fontSize: '13px',
                  fontFamily: 'monospace'
                }}
              >
                <span>{contact}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveContact(contact)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#ef4444',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: 0
                  }}
                  title="Remove contact from whitelist"
                >
                  <X size={14} />
                </button>
              </span>
            ))
          )}
        </div>
      </div>

      {/* Extra Toggles */}
      <div style={{ display: 'flex', gap: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={Boolean(config.ignoreGroups)}
            onChange={(e) => handleToggleGroups(e.target.checked)}
          />
          <span>Ignore WhatsApp Group Chats (@g.us)</span>
        </label>
      </div>
    </div>
  );
}

