const twilio = require('twilio');

class SmsService {
  constructor() {
    this.mockMode = process.env.TWILIO_MOCK_MODE === 'true';
    if (!this.mockMode) {
      try {
        this.client = twilio(
          process.env.TWILIO_ACCOUNT_SID,
          process.env.TWILIO_AUTH_TOKEN
        );
      } catch (error) {
        console.warn('Twilio initialization failed, falling back to mock mode:', error.message);
        this.mockMode = true;
      }
    }
  }

  async sendSMS(toPhoneNumber, message) {
    if (this.mockMode) {
      console.log(`[MOCK] SMS sent to ${toPhoneNumber}: ${message}`);
      return { success: true, messageId: `mock_${Date.now()}`, mock: true };
    }

    try {
      const result = await this.client.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: toPhoneNumber
      });

      console.log(`SMS sent successfully to ${toPhoneNumber}: ${result.sid}`);
      return { success: true, messageId: result.sid };
    } catch (error) {
      console.error('Error sending SMS:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new SmsService();
