const crypto = require('crypto');

/**
 * Enhanced SHA-256 double hashing for document verification
 * Implements two rounds of hashing for enhanced security
 */
function hashDocument(imageBuffer, txnId, userSalt = null) {
  // Generate salt if not provided
  if (!userSalt) {
    userSalt = crypto.randomBytes(16).toString('hex');
  }

  // Round 1: Hash the document content
  const hash1 = crypto.createHash('sha256')
    .update(imageBuffer)
    .digest('hex');

  // Round 2: Hash the first hash + user salt
  const hash2 = crypto.createHash('sha256')
    .update(hash1 + userSalt)
    .digest('hex');

  console.log(`🔒 SHA-256 double hash generated: ${hash2.substring(0, 16)}...`);
  console.log(`📄 Original hash: ${hash1.substring(0, 16)}...`);
  console.log(`🧂 Salt: ${userSalt.substring(0, 8)}...`);

  return {
    finalHash: hash2,
    originalHash: hash1,
    salt: userSalt,
    algorithm: 'SHA-256-DOUBLE'
  };
}

/**
 * Verify document hash
 */
function verifyDocumentHash(imageBuffer, txnId, expectedHash, salt) {
  const { finalHash } = hashDocument(imageBuffer, txnId, salt);
  return finalHash === expectedHash;
}

/**
 * Generate a simple hash for testing
 */
function generateSimpleHash(data) {
  return crypto.createHash('sha256')
    .update(data)
    .digest('hex');
}

/**
 * Hash user credentials for secure storage
 */
function hashCredentials(email, password, uniqueId) {
  const combined = `${email}:${password}:${uniqueId}`;
  return crypto.createHash('sha256')
    .update(combined)
    .digest('hex');
}

module.exports = {
  hashDocument,
  verifyDocumentHash,
  generateSimpleHash,
  hashCredentials,
};
