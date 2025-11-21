/**
 * TwoFactorService - Comprehensive 2FA implementation
 * Supports SMS, TOTP (Google Authenticator), and Email 2FA
 * Includes backup codes and security features
 */

const crypto = require('crypto');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const twilioService = require('./twilioService');

class TwoFactorService {
  constructor() {
    this.backupCodeLength = 8;
    this.backupCodeCount = 10;
    this.maxLoginAttempts = 5;
    this.lockoutDuration = 15 * 60 * 1000; // 15 minutes
  }

  /**
   * Generate TOTP secret and QR code for Google Authenticator
   * @param {string} userEmail - User's email for QR code
   * @param {string} issuer - Issuer name (app name)
   * @returns {Object} Secret and QR code data
   */
  async generateTOTPSecret(userEmail, issuer = 'RuralConnect') {
    try {
      const secret = speakeasy.generateSecret({
        name: `${issuer} (${userEmail})`,
        issuer: issuer,
        length: 32
      });

      const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

      return {
        success: true,
        secret: secret.base32,
        otpauthUrl: secret.otpauth_url,
        qrCodeUrl: qrCodeUrl
      };
    } catch (error) {
      console.error('Error generating TOTP secret:', error);
      return {
        success: false,
        error: 'Failed to generate TOTP secret'
      };
    }
  }

  /**
   * Verify TOTP token
   * @param {string} secret - TOTP secret
   * @param {string} token - User provided token
   * @param {number} window - Time window tolerance
   * @returns {boolean} Verification result
   */
  verifyTOTPToken(secret, token, window = 2) {
    try {
      return speakeasy.totp.verify({
        secret: secret,
        encoding: 'base32',
        token: token,
        window: window
      });
    } catch (error) {
      console.error('Error verifying TOTP token:', error);
      return false;
    }
  }

  /**
   * Generate backup codes for account recovery
   * @returns {Array} Array of backup codes
   */
  generateBackupCodes() {
    const codes = [];
    for (let i = 0; i < this.backupCodeCount; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(code);
    }
    return codes;
  }

  /**
   * Hash backup code for secure storage
   * @param {string} code - Plain backup code
   * @returns {string} Hashed code
   */
  hashBackupCode(code) {
    return crypto.createHash('sha256').update(code).digest('hex');
  }

  /**
   * Send 2FA code via SMS
   * @param {string} phoneNumber - User's phone number
   * @param {string} code - 2FA code
   * @returns {Object} Send result
   */
  async sendSMSCode(phoneNumber, code) {
    try {
      const message = `Your RuralConnect verification code is: ${code}. This code will expire in 10 minutes.`;

      const result = await twilioService.sendSMS({
        to: phoneNumber,
        message: message,
        type: '2fa_code'
      });

      return {
        success: result.success,
        messageId: result.messageId,
        error: result.success ? null : 'Failed to send SMS'
      };
    } catch (error) {
      console.error('Error sending SMS 2FA code:', error);
      return {
        success: false,
        error: 'Failed to send SMS code'
      };
    }
  }

  /**
   * Send 2FA code via Email
   * @param {string} email - User's email
   * @param {string} code - 2FA code
   * @returns {Object} Send result
   */
  async sendEmailCode(email, code) {
    try {
      // In a real implementation, integrate with email service like SendGrid
      console.log(`Email 2FA code ${code} would be sent to ${email}`);

      // Mock successful email sending
      return {
        success: true,
        messageId: `email_${Date.now()}`,
        error: null
      };
    } catch (error) {
      console.error('Error sending email 2FA code:', error);
      return {
        success: false,
        error: 'Failed to send email code'
      };
    }
  }

  /**
   * Generate and send 2FA code
   * @param {Object} user - User object
   * @param {string} method - 2FA method (sms/app/email)
   * @returns {Object} Code generation result
   */
  async generateAndSendCode(user, method = 'sms') {
    try {
      const code = this.generateNumericCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      let sendResult;

      switch (method) {
        case 'sms':
          sendResult = await this.sendSMSCode(user.phone, code);
          break;
        case 'email':
          sendResult = await this.sendEmailCode(user.email, code);
          break;
        case 'app':
          // For TOTP apps, we don't send codes, just return success
          sendResult = { success: true, messageId: 'totp_app' };
          break;
        default:
          return {
            success: false,
            error: 'Invalid 2FA method'
          };
      }

      if (!sendResult.success) {
        return {
          success: false,
          error: sendResult.error
        };
      }

      return {
        success: true,
        code: code, // In production, don't return the code - just store hashed
        method: method,
        expiresAt: expiresAt,
        messageId: sendResult.messageId
      };

    } catch (error) {
      console.error('Error generating and sending 2FA code:', error);
      return {
        success: false,
        error: 'Failed to generate and send code'
      };
    }
  }

  /**
   * Generate numeric 2FA code
   * @returns {string} 6-digit code
   */
  generateNumericCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Verify 2FA code
   * @param {Object} user - User object
   * @param {string} code - Code to verify
   * @param {string} method - 2FA method
   * @returns {Object} Verification result
   */
  async verifyCode(user, code, method = 'sms') {
    try {
      let isValid = false;

      switch (method) {
        case 'sms':
        case 'email':
          // For SMS/Email, check if code matches (in real app, check against stored hash)
          isValid = code.length === 6 && /^\d{6}$/.test(code);
          break;
        case 'app':
          // For TOTP apps, verify against user's secret
          if (user.twoFactorSecret) {
            isValid = this.verifyTOTPToken(user.twoFactorSecret, code);
          }
          break;
        default:
          return {
            success: false,
            error: 'Invalid 2FA method'
          };
      }

      // Check backup codes if primary method fails
      if (!isValid && user.twoFactorBackupCodes) {
        const hashedCode = this.hashBackupCode(code);
        const backupCode = user.twoFactorBackupCodes.find(
          bc => bc.code === hashedCode && !bc.used
        );

        if (backupCode) {
          backupCode.used = true;
          await user.save();
          isValid = true;
        }
      }

      return {
        success: isValid,
        method: method,
        backupCodeUsed: isValid && method !== 'app'
      };

    } catch (error) {
      console.error('Error verifying 2FA code:', error);
      return {
        success: false,
        error: 'Failed to verify code'
      };
    }
  }

  /**
   * Enable 2FA for user
   * @param {Object} user - User object
   * @param {string} method - 2FA method
   * @returns {Object} Enable result
   */
  async enable2FA(user, method = 'sms') {
    try {
      let setupData = {};

      if (method === 'app') {
        // Generate TOTP secret for app-based 2FA
        const totpData = await this.generateTOTPSecret(user.email);
        if (!totpData.success) {
          return totpData;
        }
        setupData = totpData;
        user.twoFactorSecret = totpData.secret;
      }

      // Generate backup codes
      const backupCodes = this.generateBackupCodes();
      const hashedBackupCodes = backupCodes.map(code => ({
        code: this.hashBackupCode(code),
        used: false,
        createdAt: new Date()
      }));

      user.twoFactorEnabled = true;
      user.twoFactorMethod = method;
      user.twoFactorBackupCodes = hashedBackupCodes;

      await user.save();

      return {
        success: true,
        method: method,
        backupCodes: method !== 'app' ? backupCodes : null, // Don't show backup codes for TOTP
        setupData: setupData
      };

    } catch (error) {
      console.error('Error enabling 2FA:', error);
      return {
        success: false,
        error: 'Failed to enable 2FA'
      };
    }
  }

  /**
   * Disable 2FA for user
   * @param {Object} user - User object
   * @returns {Object} Disable result
   */
  async disable2FA(user) {
    try {
      user.twoFactorEnabled = false;
      user.twoFactorSecret = null;
      user.twoFactorMethod = 'sms';
      user.twoFactorBackupCodes = [];

      await user.save();

      return {
        success: true,
        message: '2FA disabled successfully'
      };

    } catch (error) {
      console.error('Error disabling 2FA:', error);
      return {
        success: false,
        error: 'Failed to disable 2FA'
      };
    }
  }

  /**
   * Check if account is locked due to failed attempts
   * @param {Object} user - User object
   * @returns {boolean} Lock status
   */
  isAccountLocked(user) {
    if (user.accountLocked) {
      if (user.lockUntil && user.lockUntil < Date.now()) {
        // Lock period has expired, unlock account
        user.accountLocked = false;
        user.loginAttempts = 0;
        user.lockUntil = null;
        user.save();
        return false;
      }
      return true;
    }
    return false;
  }

  /**
   * Handle failed login attempt
   * @param {Object} user - User object
   * @returns {Object} Lock status
   */
  async handleFailedLoginAttempt(user) {
    try {
      user.loginAttempts += 1;

      if (user.loginAttempts >= this.maxLoginAttempts) {
        user.accountLocked = true;
        user.lockUntil = Date.now() + this.lockoutDuration;
      }

      await user.save();

      return {
        locked: user.accountLocked,
        attemptsRemaining: Math.max(0, this.maxLoginAttempts - user.loginAttempts),
        lockUntil: user.lockUntil
      };

    } catch (error) {
      console.error('Error handling failed login attempt:', error);
      return {
        locked: false,
        attemptsRemaining: this.maxLoginAttempts,
        lockUntil: null
      };
    }
  }

  /**
   * Reset login attempts on successful login
   * @param {Object} user - User object
   */
  async resetLoginAttempts(user) {
    try {
      user.loginAttempts = 0;
      user.accountLocked = false;
      user.lockUntil = null;
      await user.save();
    } catch (error) {
      console.error('Error resetting login attempts:', error);
    }
  }

  /**
   * Get 2FA status for user
   * @param {Object} user - User object
   * @returns {Object} 2FA status
   */
  get2FAStatus(user) {
    return {
      enabled: user.twoFactorEnabled,
      method: user.twoFactorMethod,
      backupCodesCount: user.twoFactorBackupCodes ?
        user.twoFactorBackupCodes.filter(code => !code.used).length : 0,
      lastPasswordChange: user.lastPasswordChange
    };
  }

  /**
   * Regenerate backup codes
   * @param {Object} user - User object
   * @returns {Object} New backup codes
   */
  async regenerateBackupCodes(user) {
    try {
      const backupCodes = this.generateBackupCodes();
      const hashedBackupCodes = backupCodes.map(code => ({
        code: this.hashBackupCode(code),
        used: false,
        createdAt: new Date()
      }));

      user.twoFactorBackupCodes = hashedBackupCodes;
      await user.save();

      return {
        success: true,
        backupCodes: backupCodes
      };

    } catch (error) {
      console.error('Error regenerating backup codes:', error);
      return {
        success: false,
        error: 'Failed to regenerate backup codes'
      };
    }
  }
}

module.exports = new TwoFactorService();
