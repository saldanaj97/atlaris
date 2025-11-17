#!/usr/bin/env node
/**
 * Check file sizes in src/ directory
 * Warns about files exceeding 500 lines of code
 * Outputs JSON report and exits with code 0 (warning only)
 */

const fs = require('fs');
const path = require('path');

const THRESHOLD = 500;
const srcDir = path.join(__dirname, '../src');

function countLinesOfCode(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    let locCount = 0;
    let inBlockComment = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines
      if (trimmed === '') continue;

      // Handle block comments
      if (trimmed.includes('/*')) inBlockComment = true;
      if (inBlockComment) {
        if (trimmed.includes('*/')) inBlockComment = false;
        continue;
      }

      // Skip single-line comments and TypeScript decorators
      if (trimmed.startsWith('//')) continue;

      // Count the line
      locCount++;
    }

    return locCount;
  } catch (error) {
    return 0;
  }
}

function walkDir(dir, callback) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Skip certain directories
      if (
        file === 'node_modules' ||
        file === '.next' ||
        file === 'components/ui'
      ) {
        continue;
      }
      walkDir(filePath, callback);
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      callback(filePath);
    }
  }
}

const largeFiles = [];

walkDir(srcDir, (filePath) => {
  const loc = countLinesOfCode(filePath);
  if (loc > THRESHOLD) {
    largeFiles.push({
      file: path.relative(srcDir, filePath),
      lines: loc,
      threshold: THRESHOLD,
    });
  }
});

const report = {
  timestamp: new Date().toISOString(),
  threshold: THRESHOLD,
  filesExceeding: largeFiles.length,
  files: largeFiles.sort((a, b) => b.lines - a.lines),
};

// Output summary to console
console.log('📊 File Size Check Report');
console.log('========================\n');

if (largeFiles.length === 0) {
  console.log('✅ All files are within the threshold (<' + THRESHOLD + ' LOC)');
} else {
  console.log(
    `⚠️  Found ${largeFiles.length} file(s) exceeding ${THRESHOLD} LOC:\n`
  );
  largeFiles.forEach((file) => {
    console.log(
      `  • ${file.file} (${file.lines} lines, +${file.lines - THRESHOLD} over threshold)`
    );
  });
}

console.log('\nJSON Report:');
console.log(JSON.stringify(report, null, 2));

// Write JSON report for CI parsing
fs.writeFileSync(
  path.join(__dirname, '../file-size-report.json'),
  JSON.stringify(report, null, 2)
);

// Exit with 0 (warning only, never fail)
process.exit(0);
