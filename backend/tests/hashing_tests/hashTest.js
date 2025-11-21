const fs = require("fs");
const crypto = require("crypto");

const TEST_DIR = "input_docs";
const RESULT_FILE = "results/hash_report.json";

function runHashTest() {
    const results = [];

    for (const file of fs.readdirSync(TEST_DIR)) {
        const buffer = fs.readFileSync(`${TEST_DIR}/${file}`);
        const hash = crypto.createHash("sha256").update(buffer).digest("hex");

        results.push({
            file,
            sizeKB: (buffer.length / 1024).toFixed(2),
            sha256: hash
        });
    }

    fs.writeFileSync(RESULT_FILE, JSON.stringify(results, null, 2));
    console.log("Hash test completed!");
}

runHashTest();
