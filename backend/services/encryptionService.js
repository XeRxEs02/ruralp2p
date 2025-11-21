/**
 * EncryptionService - End-to-end encryption implementation
 * Provides field-level encryption, key management, and secure data handling
 */

const crypto = require('crypto');
const { promisify } = require('util');

class EncryptionService {
  constructor() {
    // Encryption settings
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32; // 256 bits
    this.ivLength = 16; // 128 bits for GCM
    this.tagLength = 16; // 128 bits authentication tag

    // Master key for key derivation (in production, use environment variables)
    this.masterKey = process.env.ENCRYPTION_MASTER_KEY || this.generateMasterKey();

    // Key rotation settings
    this.keyRotationInterval = 90 * 24 * 60 * 60 * 1000; // 90 days
  }

  /**
   * Generate a new master key
   * @returns {string} Hex-encoded master key
   */
  generateMasterKey() {
    return crypto.randomBytes(this.keyLength).toString('hex');
  }

  /**
   * Derive encryption key from master key and context
   * @param {string} context - Context for key derivation (userId, fieldName, etc.)
   * @returns {Buffer} Derived key
   */
  deriveKey(context) {
    const salt = crypto.createHash('sha256').update(context).digest();
    return crypto.pbkdf2Sync(this.masterKey, salt, 10000, this.keyLength, 'sha256');
  }

  /**
   * Encrypt data with AES-256-GCM
   * @param {string|Buffer} data - Data to encrypt
   * @param {string} context - Context for key derivation
   * @returns {Object} Encrypted data with IV and auth tag
   */
  encrypt(data, context = 'default') {
    try {
      const key = this.deriveKey(context);
      const iv = crypto.randomBytes(this.ivLength);

      const cipher = crypto.createCipher(this.algorithm, key);
      cipher.setAAD(Buffer.from(context)); // Additional authenticated data

      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag();

      return {
        encrypted: encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        algorithm: this.algorithm,
        context: context,
        encryptedAt: new Date()
      };
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt data with AES-256-GCM
   * @param {Object} encryptedData - Encrypted data object
   * @returns {string} Decrypted data
   */
  decrypt(encryptedData) {
    try {
      const { encrypted, iv, authTag, context } = encryptedData;
      const key = this.deriveKey(context || 'default');

      const decipher = crypto.createDecipher(this.algorithm, key);
      decipher.setAAD(Buffer.from(context || 'default'));
      decipher.setAuthTag(Buffer.from(authTag, 'hex'));

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      console.error('Decryption error:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Encrypt sensitive fields in an object
   * @param {Object} data - Object with fields to encrypt
   * @param {Array} fieldsToEncrypt - Fields that should be encrypted
   * @param {string} context - Context for key derivation
   * @returns {Object} Object with encrypted fields
   */
  encryptFields(data, fieldsToEncrypt, context) {
    const encryptedData = { ...data };

    fieldsToEncrypt.forEach(field => {
      if (encryptedData[field] !== undefined && encryptedData[field] !== null) {
        const fieldContext = `${context}_${field}`;
        encryptedData[field] = this.encrypt(
          JSON.stringify(encryptedData[field]),
          fieldContext
        );
      }
    });

    return encryptedData;
  }

  /**
   * Decrypt sensitive fields in an object
   * @param {Object} data - Object with encrypted fields
   * @param {Array} fieldsToDecrypt - Fields that should be decrypted
   * @returns {Object} Object with decrypted fields
   */
  decryptFields(data, fieldsToDecrypt) {
    const decryptedData = { ...data };

    fieldsToDecrypt.forEach(field => {
      if (decryptedData[field] && typeof decryptedData[field] === 'object') {
        try {
          const decryptedValue = this.decrypt(decryptedData[field]);
          decryptedData[field] = JSON.parse(decryptedValue);
        } catch (error) {
          console.error(`Failed to decrypt field ${field}:`, error);
          // Keep encrypted value if decryption fails
        }
      }
    });

    return decryptedData;
  }

  /**
   * Generate a secure hash for data integrity
   * @param {string} data - Data to hash
   * @param {string} salt - Optional salt
   * @returns {string} Hex-encoded hash
   */
  generateHash(data, salt = '') {
    const hash = crypto.createHash('sha256');
    hash.update(data + salt);
    return hash.digest('hex');
  }

  /**
   * Generate a secure random token
   * @param {number} length - Token length in bytes
   * @returns {string} Hex-encoded token
   */
  generateSecureToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generate a secure random string (URL-safe)
   * @param {number} length - String length
   * @returns {string} URL-safe random string
   */
  generateSecureString(length = 32) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let result = '';
    const randomBytes = crypto.randomBytes(length);

    for (let i = 0; i < length; i++) {
      result += chars[randomBytes[i] % chars.length];
    }

    return result;
  }

  /**
   * Encrypt files for secure storage
   * @param {Buffer} fileBuffer - File buffer
   * @param {string} filename - Original filename
   * @param {string} context - Context for key derivation
   * @returns {Object} Encrypted file data
   */
  encryptFile(fileBuffer, filename, context = 'file') {
    try {
      const fileContext = `${context}_${filename}_${Date.now()}`;
      const encrypted = this.encrypt(fileBuffer.toString('base64'), fileContext);

      return {
        ...encrypted,
        originalFilename: filename,
        originalSize: fileBuffer.length,
        mimeType: this.detectMimeType(filename),
        encryptedAt: new Date()
      };
    } catch (error) {
      console.error('File encryption error:', error);
      throw new Error('Failed to encrypt file');
    }
  }

  /**
   * Decrypt files
   * @param {Object} encryptedFileData - Encrypted file data
   * @returns {Buffer} Decrypted file buffer
   */
  decryptFile(encryptedFileData) {
    try {
      const decryptedBase64 = this.decrypt(encryptedFileData);
      return Buffer.from(decryptedBase64, 'base64');
    } catch (error) {
      console.error('File decryption error:', error);
      throw new Error('Failed to decrypt file');
    }
  }

  /**
   * Detect MIME type from filename
   * @private
   * @param {string} filename - Filename
   * @returns {string} MIME type
   */
  detectMimeType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const mimeTypes = {
      'pdf': 'application/pdf',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'txt': 'text/plain',
      'json': 'application/json',
      'xml': 'application/xml'
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Create encrypted backup of sensitive data
   * @param {Object} data - Data to backup
   * @param {string} backupId - Unique backup identifier
   * @returns {Object} Encrypted backup
   */
  createEncryptedBackup(data, backupId) {
    try {
      const backupData = {
        id: backupId,
        data: data,
        createdAt: new Date(),
        version: '1.0'
      };

      const context = `backup_${backupId}`;
      const encrypted = this.encrypt(JSON.stringify(backupData), context);

      return {
        ...encrypted,
        backupId: backupId,
        dataType: 'backup',
        compressionEnabled: false
      };
    } catch (error) {
      console.error('Backup encryption error:', error);
      throw new Error('Failed to create encrypted backup');
    }
  }

  /**
   * Restore data from encrypted backup
   * @param {Object} encryptedBackup - Encrypted backup data
   * @returns {Object} Restored data
   */
  restoreFromBackup(encryptedBackup) {
    try {
      const decryptedData = this.decrypt(encryptedBackup);
      return JSON.parse(decryptedData);
    } catch (error) {
      console.error('Backup restoration error:', error);
      throw new Error('Failed to restore from backup');
    }
  }

  /**
   * Generate key pair for asymmetric encryption
   * @returns {Object} Public and private key pair
   */
  generateKeyPair() {
    return crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });
  }

  /**
   * Encrypt data with public key
   * @param {string} data - Data to encrypt
   * @param {string} publicKey - Public key in PEM format
   * @returns {string} Encrypted data (base64)
   */
  encryptWithPublicKey(data, publicKey) {
    try {
      const buffer = Buffer.from(data, 'utf8');
      const encrypted = crypto.publicEncrypt(
        {
          key: publicKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256'
        },
        buffer
      );
      return encrypted.toString('base64');
    } catch (error) {
      console.error('Public key encryption error:', error);
      throw new Error('Failed to encrypt with public key');
    }
  }

  /**
   * Decrypt data with private key
   * @param {string} encryptedData - Encrypted data (base64)
   * @param {string} privateKey - Private key in PEM format
   * @returns {string} Decrypted data
   */
  decryptWithPrivateKey(encryptedData, privateKey) {
    try {
      const buffer = Buffer.from(encryptedData, 'base64');
      const decrypted = crypto.privateDecrypt(
        {
          key: privateKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256'
        },
        buffer
      );
      return decrypted.toString('utf8');
    } catch (error) {
      console.error('Private key decryption error:', error);
      throw new Error('Failed to decrypt with private key');
    }
  }

  /**
   * Create digital signature for data integrity
   * @param {string} data - Data to sign
   * @param {string} privateKey - Private key in PEM format
   * @returns {string} Digital signature (base64)
   */
  createDigitalSignature(data, privateKey) {
    try {
      const sign = crypto.createSign('SHA256');
      sign.update(data);
      return sign.sign(privateKey, 'base64');
    } catch (error) {
      console.error('Digital signature creation error:', error);
      throw new Error('Failed to create digital signature');
    }
  }

  /**
   * Verify digital signature
   * @param {string} data - Original data
   * @param {string} signature - Digital signature (base64)
   * @param {string} publicKey - Public key in PEM format
   * @returns {boolean} Signature validity
   */
  verifyDigitalSignature(data, signature, publicKey) {
    try {
      const verify = crypto.createVerify('SHA256');
      verify.update(data);
      return verify.verify(publicKey, signature, 'base64');
    } catch (error) {
      console.error('Digital signature verification error:', error);
      return false;
    }
  }

  /**
   * Securely compare two values (timing attack resistant)
   * @param {string} a - First value
   * @param {string} b - Second value
   * @returns {boolean} Values are equal
   */
  secureCompare(a, b) {
    try {
      return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
    } catch (error) {
      // Fallback for different length strings
      return false;
    }
  }

  /**
   * Generate a secure password reset token
   * @param {string} userId - User ID
   * @returns {string} Secure reset token
   */
  generatePasswordResetToken(userId) {
    const payload = `${userId}.${Date.now()}.${this.generateSecureString(16)}`;
    return this.encrypt(payload, `password_reset_${userId}`);
  }

  /**
   * Verify password reset token
   * @param {string} token - Reset token
   * @param {string} userId - User ID
   * @returns {boolean} Token is valid
   */
  verifyPasswordResetToken(token, userId) {
    try {
      const decrypted = this.decrypt(token);
      const [tokenUserId, timestamp] = decrypted.split('.');

      // Check if token belongs to user
      if (tokenUserId !== userId) {
        return false;
      }

      // Check if token is not expired (24 hours)
      const tokenAge = Date.now() - parseInt(timestamp);
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours

      return tokenAge < maxAge;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get encryption service health status
   * @returns {Object} Health status
   */
  getHealthStatus() {
    return {
      status: 'healthy',
      algorithm: this.algorithm,
      keyLength: this.keyLength,
      masterKeyConfigured: !!this.masterKey,
      keyRotationInterval: this.keyRotationInterval,
      timestamp: new Date()
    };
  }
}

module.exports = new EncryptionService();
