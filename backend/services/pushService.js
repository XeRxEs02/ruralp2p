const admin = require('firebase-admin');

class PushService {
  constructor() {
    this.mockMode = process.env.FIREBASE_MOCK_MODE === 'true';
    if (!this.mockMode) {
      try {
        // Initialize Firebase Admin SDK
        const serviceAccount = require('../firebase-adminsdk.json');
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
        this.messaging = admin.messaging();
      } catch (error) {
        console.warn('Firebase initialization failed, falling back to mock mode:', error.message);
        this.mockMode = true;
      }
    }
  }

  async sendPushNotification(firebaseToken, title, message) {
    if (this.mockMode) {
      console.log(`[MOCK] Push notification sent to ${firebaseToken}: ${title} - ${message}`);
      return { success: true, messageId: `mock_push_${Date.now()}`, mock: true };
    }

    try {
      const payload = {
        notification: {
          title: title,
          body: message
        },
        token: firebaseToken
      };

      const result = await this.messaging.send(payload);
      console.log(`Push notification sent successfully: ${result}`);
      return { success: true, messageId: result };
    } catch (error) {
      console.error('Error sending push notification:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new PushService();
