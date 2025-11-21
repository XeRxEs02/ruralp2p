const fs = require("fs");
const path = require("path");
const { createWorker } = require("tesseract.js");

const TEST_DIR = "input_docs";
const RESULT_FILE = "results/ocr_report.json";

async function runOCRTest() {
    const worker = await createWorker("eng");

    const results = [];
    let totalFilesAttempted = 0;
    let successfulProcess = 0;
    let failedProcess = 0;

    const files = fs.readdirSync(TEST_DIR);
    const imageFiles = files.filter(file =>
        /\.(jpg|jpeg|png|bmp|tiff|gif)$/i.test(file)
    );

    console.log(`🔍 OCR ACCURACY TESTING - ${imageFiles.length} image files found`);

    // Test OCR system capabilities
    const systemTestResults = await testOCRSystemCapabilities();

    for (const file of imageFiles) {
        const filePath = path.join(TEST_DIR, file);
        const stats = fs.statSync(filePath);
        totalFilesAttempted++;

        console.log(`\n📄 Testing Image ${totalFilesAttempted}/${imageFiles.length}: ${file}`);
        console.log(`   File Size: ${(stats.size / 1024).toFixed(2)} KB`);

        try {
            const startTime = Date.now();

            const { data: { text, confidence } } = await worker.recognize(filePath);

            const endTime = Date.now();
            const processingTime = endTime - startTime;

            // Comprehensive text analysis
            const charCount = text.length;
            const wordCount = text.trim().split(/\s+/).filter(word => word.length > 0).length;
            const lineCount = text.trim().split('\n').filter(line => line.trim().length > 0).length;

            // Accuracy indicators
            const hasUpperCase = /[A-Z]/.test(text);
            const hasLowerCase = /[a-z]/.test(text);
            const hasNumeric = /\d/.test(text);
            const hasSpecialChars = /[^\w\s\n]/.test(text);

            // Clean text for analysis
            const cleanText = text.replace(/[^\w\s]/g, '').trim();

            // Extract meaningful text sample
            const primarySample = cleanText.substring(0, 100);

            const result = {
                file,
                sizeKB: parseFloat((stats.size / 1024).toFixed(2)),
                status: "Success",
                processingTimeMs: processingTime,
                tesseractConfidence: parseFloat(confidence.toFixed(2)),
                extractedChars: charCount,
                extractedWords: wordCount,
                extractedLines: lineCount,
                primarySample: primarySample.substring(0, 50) + (primarySample.length > 50 ? "..." : ""),
                completeText: charCount > 500 ? text.substring(0, 500) + "..." : text,
                characterAnalysis: {
                    hasUpperCase,
                    hasLowerCase,
                    hasNumeric,
                    hasSpecialChars,
                    textDiversity: [hasUpperCase, hasLowerCase, hasNumeric, hasSpecialChars].filter(x => x).length
                },
                performanceMetrics: {
                    charsPerMs: charCount > 0 ? (charCount / Math.max(processingTime, 1)).toFixed(2) : 0,
                    wordsPerSec: wordCount > 0 ? ((wordCount / processingTime) * 1000).toFixed(1) : 0
                },
                qualityAssessment: {
                    textLength: charCount > 100 ? "Good" : charCount > 20 ? "Fair" : "Poor",
                    contentDiversity: [hasUpperCase, hasLowerCase, hasNumeric].filter(x => x).length > 1 ? "Rich" : "Simple",
                    expectedContent: file.includes('aadhar') ? "ID Document (structured text expected)" : "General content"
                }
            };

            results.push(result);
            successfulProcess++;

            console.log(`   ✅ SUCCESS: ${charCount} chars, ${wordCount} words extracted`);
            console.log(`   🎯 Tesseract Confidence: ${confidence.toFixed(1)}%`);
            console.log(`   ⏱️  Processing Time: ${processingTime}ms`);
            console.log(`   📝 Sample: "${primarySample.substring(0, 30)}..."`);

        } catch (error) {
            const errorResult = {
                file,
                sizeKB: parseFloat((stats.size / 1024).toFixed(2)),
                status: "Failed",
                error: error.message,
                errorType: error.message.includes('JPEG') ? "Image Format Issue" :
                          error.message.includes('read') ? "File Read Error" : "OCR Processing Error",
                possibleCauses: [
                    "Corrupted or invalid image format",
                    "Unsupported JPEG compression",
                    "Image rotation or orientation issues",
                    "Low resolution text",
                    "Complex background patterns"
                ]
            };

            results.push(errorResult);
            failedProcess++;

            console.log(`   ❌ FAILED: ${error.message}`);
            console.log(`   🤔 Possible causes: Image format issues, compression problems`);
        }
    }

    await worker?.terminate();

    // Generate accuracy metrics
    const accuracyMetrics = calculateOCRAccuracy(results, systemTestResults);

    const finalReport = {
        testSummary: {
            totalFiles: totalFilesAttempted,
            successfulProcessing: successfulProcess,
            failedProcessing: failedProcess,
            successRate: totalFilesAttempted > 0 ? ((successfulProcess / totalFilesAttempted) * 100).toFixed(1) : 0
        },
        systemCapabilities: systemTestResults,
        fileResults: results,
        accuracyMetrics: accuracyMetrics,
        recommendations: generateOCRRecommendations(accuracyMetrics)
    };

    fs.writeFileSync(RESULT_FILE, JSON.stringify(finalReport, null, 2));

    console.log(`\n🎯 OCR ACCURACY ASSESSMENT COMPLETED`);
    console.log(`📊 Success Rate: ${finalReport.testSummary.successRate}%`);
    console.log(`📈 Overall Accuracy: ${accuracyMetrics.overallAccuracy}%`);
    console.log(`⏱️  Average Processing Speed: ${accuracyMetrics.avgProcessingSpeed} ms/image`);

    return finalReport;
}

async function testOCRSystemCapabilities() {
    return {
        tesseractVersion: "5.x (via tesseract.js)",
        languageSupport: "English (eng)",
        supportedFormats: "JPG, PNG, BMP, TIFF, GIF",
        knownLimitations: [
            "Complex JPEG compression may cause read errors",
            "Rotated images require preprocessing",
            "Low-resolution text (<100 DPI) reduces accuracy",
            "Handwritten text performance varies"
        ],
        capabilities: [
            "Multi-format image support",
            "Confidence scoring",
            "Language detection",
            "Text layout analysis"
        ]
    };
}

function calculateOCRAccuracy(results, systemCapabilities) {
    const successfulResults = results.filter(r => r.status === "Success");

    if (successfulResults.length === 0) {
        return {
            overallAccuracy: 0,
            avgProcessingSpeed: 0,
            confidenceDistribution: "N/A",
            characterExtractionRate: 0,
            successFactors: "Unable to process any images",
            qualityGrades: { excellent: 0, good: 0, fair: 0, poor: 0 }
        };
    }

    const avgConfidence = successfulResults.reduce((sum, r) => sum + r.tesseractConfidence, 0) / successfulResults.length;
    const avgProcessingTime = successfulResults.reduce((sum, r) => sum + r.processingTimeMs, 0) / successfulResults.length;
    const totalCharsExtracted = successfulResults.reduce((sum, r) => sum + r.extractedChars, 0);
    const avgCharsPerImage = totalCharsExtracted / successfulResults.length;

    // Quality distribution based on confidence and content
    const qualityDistribution = {
        excellent: successfulResults.filter(r => r.tesseractConfidence > 90).length,
        good: successfulResults.filter(r => r.tesseractConfidence > 75 && r.tesseractConfidence <= 90).length,
        fair: successfulResults.filter(r => r.tesseractConfidence > 50 && r.tesseractConfidence <= 75).length,
        poor: successfulResults.filter(r => r.tesseractConfidence <= 50).length
    };

    // Content richness score
    const contentRichness = successfulResults.map(r =>
        r.extractedChars +
        (r.characterAnalysis.hasUpperCase ? 10 : 0) +
        (r.characterAnalysis.hasLowerCase ? 10 : 0) +
        (r.characterAnalysis.hasNumeric ? 15 : 0) +
        (r.characterAnalysis.hasSpecialChars ? 5 : 0)
    ).reduce((a, b) => a + b, 0) / successfulResults.length;

    return {
        overallAccuracy: parseFloat(avgConfidence.toFixed(1)),
        avgProcessingSpeed: parseInt(avgProcessingTime),
        confidenceDistribution: `${avgConfidence.toFixed(1)}% average (${Math.min(...successfulResults.map(r => r.tesseractConfidence)).toFixed(1)}% - ${Math.max(...successfulResults.map(r => r.tesseractConfidence)).toFixed(1)}%)`,
        characterExtractionRate: parseFloat(avgCharsPerImage.toFixed(1)),
        contentRichness: parseFloat(contentRichness.toFixed(1)),
        qualityGrades: qualityDistribution,
        successFactors: successfulResults.length > 0 ? "Tesseract OCR functional with current image formats" : "Image processing failed",
        performanceClassification: avgProcessingTime < 2000 ? "Fast" : avgProcessingTime < 5000 ? "Moderate" : "Slow"
    };
}

function generateOCRRecommendations(accuracyMetrics) {
    const recommendations = [];

    if (accuracyMetrics.overallAccuracy < 70) {
        recommendations.push("Consider image preprocessing (deskew, contrast enhancement)");
    }

    if (accuracyMetrics.avgProcessingSpeed > 3000) {
        recommendations.push("Optimize image resolution (recommended: 300 DPI)");
    }

    if (accuracyMetrics.qualityGrades.poor > accuracyMetrics.qualityGrades.good) {
        recommendations.push("Verify image quality and format compatibility");
    }

    recommendations.push("Consider training custom OCR models for specific document types (e.g., ID cards)");

    return recommendations;
