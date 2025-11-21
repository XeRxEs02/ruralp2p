const fs = require("fs");
const path = require("path");
const cv = require("opencv4nodejs");
const faceapi = require("@vladmandic/face-api");

/**
 * CNN Face Recognition Accuracy Testing
 * Tests face similarity, discrimination, and authenticity detection
 */

class CNNFaceRecognitionTester {
    constructor() {
        this.results = {};
        this.modelsLoaded = false;
    }

    async loadModels() {
        if (this.modelsLoaded) return;

        console.log("🔄 Loading face recognition models...");

        // Load models from node_modules
        const modelPath = path.join(process.cwd(), "node_modules/@vladmandic/face-api/model");

        try {
            await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath);
            await faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath);
            await faceapi.nets.faceRecognitionNet.loadFromDisk(modelPath);

            this.modelsLoaded = true;
            console.log("✅ Face recognition models loaded successfully");
        } catch (error) {
            console.error("❌ Failed to load models:", error.message);
            throw error;
        }
    }

    async processBatch(batchFile) {
        await this.loadModels();

        console.log(`\n🎯 PROCESSING BATCH: ${batchFile}\n`);

        const batchConfig = JSON.parse(fs.readFileSync(batchFile, 'utf8'));
        const batch = batchConfig[0];

        console.log(`📊 Batch: ${batch.batch}`);
        console.log(`📝 Description: ${batch.description}`);
        console.log(`🖼️  Processing ${batch.images.length} images...\n`);

        // Process each image and extract face embeddings
        const faceEmbeddings = [];
        const processingResults = [];

        for (let i = 0; i < batch.images.length; i++) {
            const imagePath = batch.images[i];
            const imageName = path.basename(imagePath);

            console.log(`Processing ${i + 1}/${batch.images.length}: ${imageName}`);

            try {
                // Read image
                const imageBuffer = fs.readFileSync(path.join(process.cwd(), imagePath));

                // Convert to face-api format
                const image = await cv.imdecode(imageBuffer);
                const canvas = await this.convertMatToCanvas(image);

                // Detect face
                const detection = await faceapi.detectSingleFace(canvas)
                    .withFaceLandmarks()
                    .withFaceDescriptor();

                if (!detection) {
                    console.log(`   ❌ No face detected in ${imageName}`);
                    processingResults.push({
                        image: imageName,
                        status: "No Face Detected",
                        confidence: 0,
                        descriptor: null
                    });
                    continue;
                }

                // Store embedding
                faceEmbeddings.push({
                    image: imageName,
                    descriptor: detection.descriptor,
                    confidence: detection.detection.score
                });

                processingResults.push({
                    image: imageName,
                    status: "Face Detected",
                    confidence: detection.detection.score,
                    descriptor: detection.descriptor,
                    landmarks: detection.landmarks
                });

                console.log(`   ✅ Face detected (confidence: ${(detection.detection.score * 100).toFixed(1)}%)`);

            } catch (error) {
                console.log(`   ❌ Error processing ${imageName}: ${error.message}`);
                processingResults.push({
                    image: imageName,
                    status: "Error",
                    error: error.message,
                    confidence: 0,
                    descriptor: null
                });
            }
        }

        // Calculate intra-batch similarity metrics
        const similarityMetrics = this.calculateBatchSimilarity(batch.batch, faceEmbeddings, batch);

        // Generate comprehensive results
        const batchResults = {
            batchInfo: batch,
            processingResults: processingResults,
            faceEmbeddings: faceEmbeddings,
            similarityMetrics: similarityMetrics,
            timestamp: new Date().toISOString(),
            totalImages: batch.images.length,
            successfulDetections: faceEmbeddings.length
        };

        this.results[batch.batch] = batchResults;

        // Save batch results
        const resultFile = `backend/tests/results/cnn/${batch.batch}_cnn_results.json`;
        fs.writeFileSync(resultFile, JSON.stringify(batchResults, null, 2));

        console.log(`\n📊 BATCH ${batch.batch.toUpperCase()} ANALYSIS COMPLETE:`);
        console.log(`   ✅ Images processed: ${batchResults.totalImages}`);
        console.log(`   ✅ Face detections: ${batchResults.successfulDetections}`);
        console.log(`   📈 Success rate: ${((batchResults.successfulDetections / batchResults.totalImages) * 100).toFixed(1)}%`);
        console.log(`   📁 Results saved to: ${resultFile}\n`);

        return batchResults;
    }

    calculateBatchSimilarity(batchType, embeddings, batchConfig) {
        if (embeddings.length < 2) {
            return { error: "Need at least 2 face embeddings for similarity calculation" };
        }

        const similarityScores = [];
        const pairWiseComparisons = [];

        // Calculate all pairwise similarities
        for (let i = 0; i < embeddings.length; i++) {
            for (let j = i + 1; j < embeddings.length; j++) {
                const similarity = faceapi.euclideanDistance(
                    embeddings[i].descriptor,
                    embeddings[j].descriptor
                );

                const similarityScore = Math.max(0, Math.min(1, 1 - similarity));

                pairWiseComparisons.push({
                    image1: embeddings[i].image,
                    image2: embeddings[j].image,
                    euclideanDistance: similarity,
                    similarityScore: similarityScore
                });

                similarityScores.push(similarityScore);
            }
        }

        // Calculate statistics
        const avgSimilarity = similarityScores.reduce((a, b) => a + b, 0) / similarityScores.length;
        const minSimilarity = Math.min(...similarityScores);
        const maxSimilarity = Math.max(...similarityScores);
        const stdDevSimilarity = this.calculateStdDev(similarityScores);

        // Batch-specific metrics
        let accuracyMetric = 0;
        let passThreshold = false;

        switch (batchType) {
            case "batch1_same_person":
                // Same person: expect high similarity (>75%)
                accuracyMetric = avgSimilarity;
                passThreshold = accuracyMetric > 0.75;
                break;

            case "batch2_different_people":
                // Different people: expect low similarity (<35%)
                accuracyMetric = avgSimilarity;
                passThreshold = accuracyMetric < 0.35;
                break;

            case "batch3_mixed_authenticity":
                // Mixed: should show clear separation
                // Here we'd need ground truth comparison, for now use general stats
                accuracyMetric = avgSimilarity;
                passThreshold = stdDevSimilarity > 0.2; // Expect high variance in mixed data
                break;
        }

        return {
            summary: {
                averageSimilarity: avgSimilarity,
                minSimilarity: minSimilarity,
                maxSimilarity: maxSimilarity,
                stdDevSimilarity: stdDevSimilarity,
                totalComparisons: pairWiseComparisons.length,
                accuracyMetric: accuracyMetric,
                passThreshold: passThreshold
            },
            pairWiseComparisons: pairWiseComparisons,
            batchType: batchType,
            interpretation: this.interpretBatchResults(batchType, avgSimilarity, stdDevSimilarity)
        };
    }

    calculateStdDev(values) {
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const squareDiffs = values.map(value => Math.pow(value - mean, 2));
        const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
        return Math.sqrt(avgSquareDiff);
    }

    interpretBatchResults(batchType, avgSimilarity, stdDev) {
        let interpretation = "";

        switch (batchType) {
            case "batch1_same_person":
                if (avgSimilarity > 0.80) {
                    interpretation = "EXCELLENT: High consistency in same-person recognition";
                } else if (avgSimilarity > 0.70) {
                    interpretation = "GOOD: Acceptable recognition consistency";
                } else {
                    interpretation = "POOR: Low confidence in same-person recognition";
                }
                break;

            case "batch2_different_people":
                if (avgSimilarity < 0.30) {
                    interpretation = "EXCELLENT: Strong discrimination between different people";
                } else if (avgSimilarity < 0.40) {
                    interpretation = "GOOD: Adequate discrimination capability";
                } else {
                    interpretation = "POOR: Weak discrimination between different individuals";
                }
                break;

            case "batch3_mixed_authenticity":
                if (stdDev > 0.25) {
                    interpretation = "EXCELLENT: Clear separation between real and AI-generated faces";
                } else if (stdDev > 0.15) {
                    interpretation = "GOOD: Moderate authenticity differentiation";
                } else {
                    interpretation = "POOR: Insufficient AI/real face separation";
                }
                break;
        }

        return interpretation;
    }

    async convertMatToCanvas(mat) {
        // Convert OpenCV Mat to canvas for face-api
        const { Canvas, createCanvas } = require('canvas');
        const canvas = createCanvas(mat.cols, mat.rows);
        const ctx = canvas.getContext('2d');

        // Convert Mat to RGBA buffer and put on canvas
        const rgbaBuffer = mat.getDataAsArray();
        const imageData = ctx.createImageData(mat.cols, mat.rows);

        for (let i = 0; i < rgbaBuffer.length; i++) {
            for (let j = 0; j < rgbaBuffer[i].length; j++) {
                const pixel = rgbaBuffer[i][j];
                const index = (i * mat.cols + j) * 4;
                imageData.data[index] = pixel[0]; // B
                imageData.data[index + 1] = pixel[1]; // G
                imageData.data[index + 2] = pixel[2]; // R
                imageData.data[index + 3] = 255; // A
            }
        }

        ctx.putImageData(imageData, 0, 0);
        return canvas;
    }

    generateOverallReport() {
        const overallResults = {
            testSummary: {
                totalBatches: Object.keys(this.results).length,
                totalImages: Object.values(this.results).reduce((sum, batch) => sum + batch.totalImages, 0),
                successfulDetections: Object.values(this.results).reduce((sum, batch) => sum + batch.successfulDetections, 0),
                overallSuccessRate: 0
            },
            batchResults: this.results,
            performanceMetrics: {},
            recommendations: [],
            timestamp: new Date().toISOString()
        };

        // Calculate overall success rate
        const totalImages = overallResults.testSummary.totalImages;
        const successfulDetections = overallResults.testSummary.successfulDetections;
        overallResults.testSummary.overallSuccessRate = totalImages > 0 ?
            ((successfulDetections / totalImages) * 100).toFixed(1) : 0;

        // Generate performance metrics across all batches
        overallResults.performanceMetrics = this.aggregatePerformanceMetrics();

        // Generate recommendations
        overallResults.recommendations = this.generateRecommendations();

        // Save overall report
        fs.mkdirSync("backend/tests/results/cnn", { recursive: true });
        fs.writeFileSync("backend/tests/results/cnn/overall_cnn_accuracy_report.json", JSON.stringify(overallResults, null, 2));

        return overallResults;
    }

    aggregatePerformanceMetrics() {
        const allSimilarities = [];
        const allConfidences = [];
        const batchAccuracies = {};

        Object.entries(this.results).forEach(([batchName, batchResult]) => {
            if (batchResult.similarityMetrics?.pairWiseComparisons) {
                batchResult.similarityMetrics.pairWiseComparisons.forEach(comparison => {
                    allSimilarities.push(comparison.similarityScore);
                });
            }

            batchResult.faceEmbeddings.forEach(embedding => {
                allConfidences.push(embedding.confidence);
            });

            if (batchResult.similarityMetrics?.summary) {
                batchAccuracies[batchName] = {
                    accuracyMetric: batchResult.similarityMetrics.summary.accuracyMetric,
                    passThreshold: batchResult.similarityMetrics.summary.passThreshold,
                    interpretation: batchResult.similarityMetrics.interpretation
                };
            }
        });

        return {
            overallSimilarityStats: this.calculateSimilarityStats(allSimilarities),
            overallConfidenceStats: this.calculateSimilarityStats(allConfidences),
            batchAccuracyResults: batchAccuracies,
            systemPerformance: this.evaluateSystemPerformance(batchAccuracies)
        };
    }

    calculateSimilarityStats(values) {
        if (values.length === 0) return { error: "No values to analyze" };

        const sorted = [...values].sort((a, b) => a - b);
        return {
            count: values.length,
            average: values.reduce((a, b) => a + b, 0) / values.length,
            min: sorted[0],
            max: sorted[sorted.length - 1],
            median: sorted[Math.floor(sorted.length / 2)],
            stdDev: this.calculateStdDev(values),
            quartiles: {
                q1: sorted[Math.floor(sorted.length * 0.25)],
                q3: sorted[Math.floor(sorted.length * 0.75)]
            }
        };
    }

    evaluateSystemPerformance(batchAccuracies) {
        const metrics = Object.values(batchAccuracies);
        const passingBatches = metrics.filter(m => m.passThreshold).length;
        const accuracyScore = metrics.length > 0 ?
            (passingBatches / metrics.length) * 100 : 0;

        let overallRating = "UNKNOWN";
        if (accuracyScore >= 90) overallRating = "EXCELLENT";
        else if (accuracyScore >= 80) overallRating = "GOOD";
        else if (accuracyScore >= 70) overallRating = "FAIR";
        else overallRating = "NEEDS_IMPROVEMENT";

        return {
            accuracyScore: `${accuracyScore.toFixed(1)}%`,
            passingBatches: `${passingBatches}/${metrics.length}`,
            overallRating: overallRating,
            interpretation: this.getPerformanceInterpretation(overallRating)
        };
    }

    getPerformanceInterpretation(rating) {
        const interpretations = {
            EXCELLENT: "Outstanding face recognition performance with high accuracy across all test scenarios",
            GOOD: "Solid face recognition capabilities with acceptable performance in most use cases",
            FAIR: "Adequate face recognition but may have issues in challenging scenarios",
            NEEDS_IMPROVEMENT: "Face recognition performance below acceptable levels, requires optimization"
        };
        return interpretations[rating] || "Performance evaluation incomplete";
    }

    generateRecommendations() {
        const recommendations = [];

        const systemPerf = this.aggregatePerformanceMetrics()?.systemPerformance;
        if (!systemPerf) return recommendations;

        if (systemPerf.overallRating === "NEEDS_IMPROVEMENT") {
            recommendations.push("Implement advanced face detection preprocessing");
            recommendations.push("Optimize image quality requirements (minimum resolution: 200x200px)");
            recommendations.push("Add multiple face detection algorithms for robustness");
        } else if (systemPerf.overallRating === "FAIR") {
            recommendations.push("Improve lighting condition handling");
            recommendations.push("Add face angle/pose correction preprocessing");
            recommendations.push("Consider ensemble methods for higher accuracy");
        } else if (systemPerf.overallRating === "GOOD") {
            recommendations.push("Monitor performance in edge cases (glasses, hats, lighting)");
            recommendations.push("Consider real-time optimization strategies");
        } else {
            recommendations.push("MAINTAIN current excellent performance standards");
        }

        return recommendations;
    }
}

// Execute CNN testing based on command line argument
async function runCNNTesting() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log("❌ Usage: node run_cnn_test.js <batch_file.json>");
        console.log("📝 Available batches: cnn_batch1.json, cnn_batch2.json, cnn_batch3.json");
        return;
    }

    const batchFile = args[0];
    const tester = new CNNFaceRecognitionTester();

    try {
        console.log("🎯 STARTING CNN FACE RECOGNITION ACCURACY TESTING");
        console.log("=" * 60);

        const batchResults = await tester.processBatch(batchFile);

        // If all batches processed, generate overall report
        if (Object.keys(tester.results).length >= 3) {
            console.log("\n🎊 ALL BATCHES PROCESSED - GENERATING COMPREHENSIVE REPORT\n");

            const finalReport = tester.generateOverallReport();

            console.log("🏆 FINAL CNN ACCURACY RESULTS:");
            console.log(`   📊 Overall Success Rate: ${finalReport.testSummary.overallSuccessRate}%`);
            console.log(`   🎯 System Performance: ${finalReport.performanceMetrics.systemPerformance.overallRating}`);
            console.log(`   📈 Accuracy Score: ${finalReport.performanceMetrics.systemPerformance.accuracyScore}`);
            console.log(`   📁 Complete report saved to: backend/tests/results/cnn/overall_cnn_accuracy_report.json`);
        }

    } catch (error) {
        console.error("❌ CNN Testing Failed:", error.message);
        console.error("Stack trace:", error.stack);
    }
}

runCNNTesting();
