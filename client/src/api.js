const BASE_URL = '/api/v1';

export function getApiKey() {
  return localStorage.getItem('wag_api_key') || '';
}

export function setApiKey(key) {
  if (key) {
    localStorage.setItem('wag_api_key', key);
  } else {
    localStorage.removeItem('wag_api_key');
  }
}

async function request(endpoint, options = {}) {
  const isFormData = options.body instanceof FormData;
  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers || {})
  };

  const key = getApiKey();
  if (key && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${key}`;
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers
  });

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('image/')) {
    const blob = await response.blob();
    return { ok: response.ok, status: response.status, data: URL.createObjectURL(blob), isBlob: true };
  }

  let data = null;
  try {
    data = await response.json();
  } catch (err) {
    data = null;
  }

  if (!response.ok) {
    const errorMsg = data?.message || `Request failed with status ${response.status}`;
    throw new Error(errorMsg);
  }

  return data;
}

export const api = {
  // Health
  getHealth: () => request('/health'),

  // Sessions
  getSessions: () => request('/sessions'),
  createSession: (id, name) => request('/sessions', {
    method: 'POST',
    body: JSON.stringify({ id, name })
  }),
  deleteSession: (id) => request(`/sessions/${id}`, { method: 'DELETE' }),
  getQRString: (id) => request(`/sessions/${id}/qr?format=json`),
  getQRPngUrl: (id) => `${BASE_URL}/sessions/${id}/qr?format=png&t=${Date.now()}`,
  simulateIncoming: (sessionId, body) => request(`/sessions/${sessionId}/simulate/incoming`, {
    method: 'POST',
    body: JSON.stringify(body)
  }),
  getSessionPrivacy: (sessionId) => request(`/sessions/${sessionId}/privacy`),
  updateSessionPrivacy: (sessionId, body) => request(`/sessions/${sessionId}/privacy`, {
    method: 'PUT',
    body: JSON.stringify(body)
  }),
  addAllowedPrivacyContact: (sessionId, contact) => request(`/sessions/${sessionId}/privacy/allow`, {
    method: 'POST',
    body: JSON.stringify({ contact })
  }),
  removeAllowedPrivacyContact: (sessionId, contact) => request(`/sessions/${sessionId}/privacy/remove`, {
    method: 'POST',
    body: JSON.stringify({ contact })
  }),


  // Messages
  sendText: (sessionId, body) => request(`/sessions/${sessionId}/messages/text`, {
    method: 'POST',
    body: JSON.stringify(body)
  }),
  sendImage: (sessionId, body) => request(`/sessions/${sessionId}/messages/image`, {
    method: 'POST',
    body: JSON.stringify(body)
  }),
  sendImageUpload: (sessionId, formData) => request(`/sessions/${sessionId}/messages/image/upload`, {
    method: 'POST',
    body: formData
  }),
  sendDocument: (sessionId, body) => request(`/sessions/${sessionId}/messages/document`, {
    method: 'POST',
    body: JSON.stringify(body)
  }),
  sendDocumentUpload: (sessionId, formData) => request(`/sessions/${sessionId}/messages/document/upload`, {
    method: 'POST',
    body: formData
  }),
  sendVoice: (sessionId, body) => request(`/sessions/${sessionId}/messages/voice`, {
    method: 'POST',
    body: JSON.stringify(body)
  }),
  sendVoiceUpload: (sessionId, formData) => request(`/sessions/${sessionId}/messages/voice/upload`, {
    method: 'POST',
    body: formData
  }),
  sendVoiceSynthesize: (sessionId, body) => request(`/sessions/${sessionId}/messages/voice/synthesize`, {
    method: 'POST',
    body: JSON.stringify(body)
  }),
  getVoiceConfig: (sessionId) => request(`/sessions/${sessionId}/messages/voice/config`),
  updateVoiceConfig: (sessionId, body) => request(`/sessions/${sessionId}/messages/voice/config`, {
    method: 'PUT',
    body: JSON.stringify(body)
  }),
  sendReaction: (sessionId, body) => request(`/sessions/${sessionId}/messages/react`, {
    method: 'POST',
    body: JSON.stringify(body)
  }),
  getMessages: (sessionId, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/sessions/${sessionId}/messages${query ? `?${query}` : ''}`);
  },
  getChatContext: (sessionId, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/sessions/${sessionId}/messages/context/chat${query ? `?${query}` : ''}`);
  },

  // Generic File Upload
  uploadFile: (formData) => request('/uploads', {
    method: 'POST',
    body: formData
  }),

  // RAG Knowledge Base & Gemini AI
  getKnowledgeDocuments: () => request('/rag/documents'),
  uploadKnowledgeDocument: (formData) => request('/rag/documents/upload', {
    method: 'POST',
    body: formData
  }),
  deleteKnowledgeDocument: (id) => request(`/rag/documents/${id}`, { method: 'DELETE' }),
  queryKnowledgeBase: (body) => request('/rag/query', {
    method: 'POST',
    body: JSON.stringify(body)
  }),
  getRagSettings: (sessionId) => {
    const query = sessionId ? `?sessionId=${sessionId}` : '';
    return request(`/rag/settings${query}`);
  },
  updateRagSettings: (body) => request('/rag/settings', {
    method: 'POST',
    body: JSON.stringify(body)
  }),

  // Webhooks
  getWebhooks: (sessionId) => {
    const query = sessionId ? `?sessionId=${sessionId}` : '';
    return request(`/webhooks${query}`);
  },
  registerWebhook: (body) => request('/webhooks', {
    method: 'POST',
    body: JSON.stringify(body)
  }),
  updateWebhook: (id, body) => request(`/webhooks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  }),
  deleteWebhook: (id) => request(`/webhooks/${id}`, { method: 'DELETE' }),
  getWebhookDeliveries: (id, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/webhooks/${id}/deliveries${query ? `?${query}` : ''}`);
  },
  retryDelivery: (deliveryId) => request(`/webhooks/deliveries/${deliveryId}/retry`, {
    method: 'POST'
  }),

  // API Keys
  getApiKeys: () => request('/api-keys'),
  createApiKey: (body) => request('/api-keys', {
    method: 'POST',
    body: JSON.stringify(body)
  }),
  revokeApiKey: (id) => request(`/api-keys/${id}/revoke`, { method: 'PATCH' }),
  deleteApiKey: (id) => request(`/api-keys/${id}`, { method: 'DELETE' })
};
