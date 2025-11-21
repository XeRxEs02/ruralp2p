const fs = require("fs");
const { glob } = require("glob");

const patterns = [
  "MOCK_MODE\\s*=\\s*true",
  "twilio.*console\\.log",
  "firebase.*mock",
  "mock", "simulate"
];

glob("**/*.*", { ignore: ["node_modules/**", ".git/**", "dist/**", "build/**"] }, (err, files) => {
  const offenders = [];
  for (const f of files) {
    const txt = fs.readFileSync(f, "utf8");
    if (patterns.some(p => new RegExp(p, "i").test(txt))) offenders.push(f);
  }
  console.log({ offenders: [...new Set(offenders)] });
});
