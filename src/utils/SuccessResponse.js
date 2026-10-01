class SuccessResponse {
  constructor({ statusCode = 200, message = 'Success', data = null }) {
    this.success = true;
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;
  }
  send(res) {
    return res.status(this.statusCode).json({
      success: this.success,
      message: this.message,
      data: this.data
    });
  }
}

export default SuccessResponse;
