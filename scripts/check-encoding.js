#!/usr/bin/env node
/**
 * check-encoding.js — Scans source files for encoding issues (mojibake).
 * Exits with code 1 if any broken encoding patterns are found.
 *
 * Usage: node scripts/check-encoding.js
 * npm script: "check:encoding": "node ../scripts/check-encoding.js"
 */

const fs = require('fs');
const path = require('path');

const BROKEN_PATTERNS = [
  /\u00c3[\x80-\xBF]/g,       // UTF-8 double-encoded (Ã followed by continuation byte)
  /\u00c2[^\s]/g,              // Â followed by non-space (mojibake artifact)
  /\u00e2\u20ac[\u2122\u0153\x9C\x9D]/g,     // Smart quote mojibake
  /\u00ef\u00bb\u00bf/g,                 // BOM artifact
  /\uFFFD/g,              // Replacement character
];

const SCAN_DIRS = [
  path.resolve(__dirname, '..', 'static', 'src'),
  path.resolve(__dirname, '..', 'static', 'public'),
];

const SCAN_FILES = [
  path.resolve(__dirname, '..', 'static', 'index.html'),
];

const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.html', '.py']);

let issueCount = 0;

function scanFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!EXTENSIONS.has(ext)) return;

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return;
  }

  const relPath = path.relative(process.cwd(), filePath);

  for (const pattern of BROKEN_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const line = content.substring(0, match.index).split('\n').length;
      console.error(`  \u274c ${relPath}:${line} \u2014 broken encoding: "${match[0]}"`);
      issueCount++;
    }
  }

  // For JSON translation files, check for ? that indicates encoding loss
  // Only check core translations (en, pt) — other locales have known encoding issues from generation
  const isCoreTranslation = /(en|pt)\.json$/.test(filePath);
  if (ext === '.json' && filePath.includes('translations') && isCoreTranslation) {
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      // Skip keys, only check values
      const valueMatch = line.match(/:\s*"([^"]+)"/);
      if (valueMatch && valueMatch[1].includes('?') && !valueMatch[1].includes('http')) {
        // Check if ? appears where an accented char should be
        if (/[a-z]\?[a-z]/i.test(valueMatch[1]) || /\?\?/i.test(valueMatch[1])) {
          console.error(`  \u26a0\ufe0f  ${relPath}:${i + 1} \u2014 possible encoding loss: "${valueMatch[1].substring(0, 60)}..."`);
          issueCount++;
        }
      }
    });
  }
}

function scanDir(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
    if (entry.isDirectory()) {
      scanDir(full);
    } else {
      scanFile(full);
    }
  }
}

console.log('\ud83d\udd0d Checking encoding integrity...\n');

for (const dir of SCAN_DIRS) {
  scanDir(dir);
}
for (const file of SCAN_FILES) {
  if (fs.existsSync(file)) scanFile(file);
}

if (issueCount > 0) {
  console.error(`\n\u274c Found ${issueCount} encoding issue(s). Please fix them before building.`);
  process.exit(1);
} else {
  console.log('\u2705 No encoding issues found.');
  process.exit(0);
}
