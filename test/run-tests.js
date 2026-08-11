'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const testDirectory = __dirname;
const testFiles = fs.readdirSync(testDirectory)
  .filter(name => name.endsWith('.test.js'))
  .sort()
  .map(name => path.join(testDirectory, name));

if (!testFiles.length) {
  console.error('No test files found');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...testFiles], { stdio:'inherit' });
process.exit(result.status == null ? 1 : result.status);
