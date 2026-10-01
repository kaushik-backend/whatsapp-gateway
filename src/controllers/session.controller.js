import catchAsync from '../utils/catchAsync.js';
import SuccessResponse from '../utils/SuccessResponse.js';
import sessionService from '../services/session.service.js';
import qrcode from 'qrcode';

export const createSession = catchAsync(async (req, res) => {
  const { id, name } = req.body;
  const session = await sessionService.create(id, name);
  new SuccessResponse({ statusCode: 201, data: session, message: 'Session created' }).send(res);
});

export const listSessions = catchAsync(async (req, res) => {
  const sessions = await sessionService.list();
  new SuccessResponse({ data: sessions, message: 'Sessions retrieved' }).send(res);
});

export const getSessionQR = catchAsync(async (req, res) => {
  const { id } = req.params;
  const format = req.query.format || 'png';
  
  const qrResult = await sessionService.getQR(id);
  
  if (qrResult.status === 'connected') {
    if (format === 'png') {
      res.type('png');
      return qrcode.toFileStream(res, `https://wa.me/?text=Session_${encodeURIComponent(id)}_Connected`);
    }
    return new SuccessResponse({
      data: { connected: true, status: 'connected', qr: null },
      message: 'Session is already connected. No QR code needed.'
    }).send(res);
  }

  if (!qrResult.qr) {
    if (format === 'png') {
      res.type('png');
      return qrcode.toFileStream(res, `whatsapp-gateway:session:${encodeURIComponent(id)}:waiting_for_qr`);
    }
    return new SuccessResponse({
      data: { connected: false, status: qrResult.status, qr: null },
      message: 'QR code not available at this time'
    }).send(res);
  }

  if (format === 'png') {
    res.type('png');
    return qrcode.toFileStream(res, qrResult.qr);
  }

  new SuccessResponse({ data: { qr: qrResult.qr, status: 'qr' }, message: 'QR code retrieved' }).send(res);
});

export const deleteSession = catchAsync(async (req, res) => {
  const { id } = req.params;
  await sessionService.delete(id);
  new SuccessResponse({ message: 'Session deleted successfully' }).send(res);
});

export const simulateIncoming = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { from = '919876543210', text = 'Hello from customer!', type = 'text', url } = req.body || {};
  const result = await sessionService.simulateIncoming(id, { fromPhone: from, text, type, url });
  new SuccessResponse({ data: result, message: 'Simulated customer message dispatched' }).send(res);
});

export const getSessionPrivacy = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { privacyFilterService } = await import('../services/privacyFilter.service.js');
  const config = privacyFilterService.getConfig(id);
  new SuccessResponse({ data: config, message: 'Session privacy configuration retrieved' }).send(res);
});

export const updateSessionPrivacy = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { privacyFilterService } = await import('../services/privacyFilter.service.js');
  const updated = privacyFilterService.updateConfig(id, req.body || {});
  new SuccessResponse({ data: updated, message: 'Session privacy configuration updated' }).send(res);
});

export const addAllowedPrivacyContact = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { contact } = req.body || {};
  const { privacyFilterService } = await import('../services/privacyFilter.service.js');
  const updated = privacyFilterService.addAllowedContact(id, contact);
  new SuccessResponse({ data: updated, message: 'Contact added to privacy whitelist' }).send(res);
});

export const removeAllowedPrivacyContact = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { contact } = req.body || {};
  const { privacyFilterService } = await import('../services/privacyFilter.service.js');
  const updated = privacyFilterService.removeAllowedContact(id, contact);
  new SuccessResponse({ data: updated, message: 'Contact removed from privacy whitelist' }).send(res);
});

export const getAntiBanStatus = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { default: antiBanService } = await import('../services/antiBan.service.js');
  const stats = antiBanService.getSessionStats(id);
  new SuccessResponse({ data: stats, message: 'Anti-ban status retrieved' }).send(res);
});

export const updateAntiBanMode = catchAsync(async (req, res) => {
  const { mode } = req.body || {};
  const { default: antiBanService } = await import('../services/antiBan.service.js');
  if (mode) {
    antiBanService.setMode(mode);
  }
  const stats = antiBanService.getSessionStats(req.params.id);
  new SuccessResponse({ data: stats, message: `Anti-ban mode updated to ${mode}` }).send(res);
});


