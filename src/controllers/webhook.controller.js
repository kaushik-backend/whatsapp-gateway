import { webhookService } from '../services/webhook.service.js';
import catchAsync from '../utils/catchAsync.js';
import SuccessResponse from '../utils/SuccessResponse.js';

export const registerWebhook = catchAsync(async (req, res) => {
  const { sessionId, url, secret, events, chatJids } = req.body;
  const webhook = await webhookService.register(sessionId, url, secret, events, chatJids);
  
  new SuccessResponse({
    statusCode: 201,
    message: 'Webhook registered successfully',
    data: webhook
  }).send(res);
});

export const listWebhooks = catchAsync(async (req, res) => {
  const { sessionId } = req.query;
  const webhooks = await webhookService.list(sessionId);
  
  new SuccessResponse({
    data: webhooks,
    message: 'Webhooks retrieved successfully'
  }).send(res);
});

export const updateWebhook = catchAsync(async (req, res) => {
  const { id } = req.params;
  const data = req.body;
  
  const webhook = await webhookService.update(id, data);
  
  new SuccessResponse({
    data: webhook,
    message: 'Webhook updated successfully'
  }).send(res);
});

export const deleteWebhook = catchAsync(async (req, res) => {
  const { id } = req.params;
  await webhookService.delete(id);
  
  new SuccessResponse({
    data: null,
    message: 'Webhook deleted successfully'
  }).send(res);
});

export const getDeliveries = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { status, limit, offset } = req.query;
  
  const result = await webhookService.getDeliveries(id, { 
    status, 
    limit: limit ? parseInt(limit) : 50, 
    offset: offset ? parseInt(offset) : 0 
  });
  
  new SuccessResponse({
    data: result,
    message: 'Webhook deliveries retrieved'
  }).send(res);
});

export const retryDelivery = catchAsync(async (req, res) => {
  const { deliveryId } = req.params;
  const delivery = await webhookService.retryDelivery(deliveryId);
  
  new SuccessResponse({
    data: delivery,
    message: 'Delivery retry scheduled'
  }).send(res);
});
