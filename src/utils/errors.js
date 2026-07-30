class AppointmentError extends Error {
  constructor(message, code, userMessage) {
    super(message);
    this.name = 'AppointmentError';
    this.code = code;
    this.userMessage = userMessage;
  }
}

module.exports = { AppointmentError };
