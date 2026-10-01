import catchAsync from '../utils/catchAsync.js';
import SuccessResponse from '../utils/SuccessResponse.js';
import AppError from '../utils/AppError.js';

export const uploadFile = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new AppError('No file uploaded', 400);
  }

  const fileUrl = `/uploads/${req.file.filename}`;

  new SuccessResponse({
    statusCode: 201,
    data: {
      url: fileUrl,
      filename: req.file.originalname,
      storedName: req.file.filename,
      mimetype: req.file.mimetype,
      size: req.file.size
    },
    message: 'File uploaded successfully'
  }).send(res);
});
