import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import SessionsTab from './components/SessionsTab';
import MessagesTab from './components/MessagesTab';
import RagTab from './components/RagTab';
import WebhooksTab from './components/WebhooksTab';
import ApiKeysTab from './components/ApiKeysTab';
import { api } from './api';

export default function App() {
  const [activeTab, setActiveTab] = useState('sessions');
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [isOnline, setIsOnline] = useState(false);

  const fetchGlobalData = async () => {
    // 1. Check health
    try {
      await api.getHealth();
      setIsOnline(true);
    } catch (err) {
      setIsOnline(false);
    }

    // 2. Fetch sessions
    try {
      const res = await api.getSessions();
      const list = res.data || [];
      setSessions(list);
      if (list.length > 0) {
        setActiveSessionId((prev) => {
          if (prev && list.some((s) => s.id === prev)) return prev;
          return list[0].id;
        });
      } else {
        setActiveSessionId(null);
      }
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    }
  };

  useEffect(() => {
    fetchGlobalData();
    // Poll every 10 seconds for session status updates
    const interval = setInterval(fetchGlobalData, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        sessions={sessions}
        activeSessionId={activeSessionId}
        setActiveSessionId={setActiveSessionId}
        isOnline={isOnline}
        onRefresh={fetchGlobalData}
      />

      <main style={{ flex: 1, backgroundColor: 'var(--bg-primary)' }}>
        {activeTab === 'sessions' && (
          <SessionsTab
            sessions={sessions}
            onRefresh={fetchGlobalData}
            activeSessionId={activeSessionId}
            setActiveSessionId={setActiveSessionId}
          />
        )}

        {activeTab === 'messages' && (
          <MessagesTab
            activeSessionId={activeSessionId}
            sessions={sessions}
          />
        )}

        {activeTab === 'rag' && (
          <RagTab
            activeSessionId={activeSessionId}
            sessions={sessions}
          />
        )}

        {activeTab === 'webhooks' && (
          <WebhooksTab
            activeSessionId={activeSessionId}
          />
        )}

        {activeTab === 'apikeys' && (
          <ApiKeysTab
            onRefresh={fetchGlobalData}
          />
        )}
      </main>
    </div>
  );
}
