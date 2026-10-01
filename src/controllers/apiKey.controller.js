import { apiKeyService } from '../services/apiKey.service.js';
import catchAsync from '../utils/catchAsync.js';
import SuccessResponse from '../utils/SuccessResponse.js';

export const createKey = catchAsync(async (req, res) => {
  const { name, scopes, sessionIds, chatJids } = req.body;
  
  const result = await apiKeyService.create(name, scopes, sessionIds, chatJids);
  
  new SuccessResponse({
    statusCode: 201,
    message: 'API key created successfully. PLEASE SAVE THE RAW KEY AS IT WILL ONLY BE SHOWN ONCE.',
    data: result
  }).send(res);
});

export const listKeys = catchAsync(async (req, res) => {
  const keys = await apiKeyService.list();
  
  new SuccessResponse({
    data: keys,
    message: 'API keys retrieved successfully'
  }).send(res);
});

export const revokeKey = catchAsync(async (req, res) => {
  const { id } = req.params;
  
  const updatedKey = await apiKeyService.revoke(id);
  
  new SuccessResponse({
    data: { id: updatedKey.id, active: updatedKey.active },
    message: 'API key revoked successfully'
  }).send(res);
});

export const deleteKey = catchAsync(async (req, res) => {
  const { id } = req.params;
  
  await apiKeyService.delete(id);
  
  new SuccessResponse({
    data: null,
    message: 'API key deleted successfully'
  }).send(res);
});
