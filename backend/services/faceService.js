/**
 * Face Service - Real FaceNet Biometric Authentication
 * Provides FaceNet model loading, embedding extraction, and similarity calculation
 */

const { extractEmbedding, cosineSimilarity: calculateCosineSimilarity } = require('../algorithms/facenetVerify');

let modelsLoaded = false;

/**
 * Load FaceNet model (SSD MobileNet + FaceNet)
 * @returns {Promise<boolean>} Success status
 */
async function loadFaceNetModel() {
  try {
    if (modelsLoaded) {
      console.log('✅ FaceNet models already loaded');
      return true;
    }

    // Import the initialization function from facenetVerify
    const { initializeModels } = require('../algorithms/facenetVerify');
    const success = await initializeModels();

    if (success) {
      modelsLoaded = true;
      console.log('✅ FaceNet models loaded successfully in faceService');
    }

    return success;
  } catch (error) {
    console.error('❌ Error loading FaceNet model:', error);
    throw new Error('Failed to load FaceNet model');
  }
}

/**
 * Extract 128-dimensional face embedding from image buffer
 * @param {Buffer} imageBuffer - Image buffer containing face
 * @returns {Promise<Array<number>>} Face embedding vector
 */
async function getEmbedding(imageBuffer) {
  try {
    // Ensure models are loaded
    if (!modelsLoaded) {
      await loadFaceNetModel();
    }

    // Extract embedding using the algorithm
    const embedding = await extractEmbedding(imageBuffer);

    // Convert Float32Array to regular array for JSON serialization
    return Array.from(embedding);
  } catch (error) {
    console.error('❌ Error extracting face embedding:', error);
    throw error;
  }
}

/**
 * Calculate cosine similarity between two embedding vectors
 * @param {Array<number>} vecA - First embedding vector
 * @param {Array<number>} vecB - Second embedding vector
 * @returns {Promise<number>} Similarity score (0-1)
 */
async function cosineSimilarity(vecA, vecB) {
  try {
    // Convert arrays back to Float32Array for calculation
    const floatVecA = new Float32Array(vecA);
    const floatVecB = new Float32Array(vecB);

    return await calculateCosineSimilarity(floatVecA, floatVecB);
  } catch (error) {
    console.error('❌ Error calculating cosine similarity:', error);
    throw error;
  }
}

module.exports = {
  loadFaceNetModel,
  getEmbedding,
  cosineSimilarity,
};
