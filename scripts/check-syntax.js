'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const skip = new Set(['node_modules', 'coverage', '.git']);

function walk(dir, files) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(full);
  }
}

const files = [];
walk(root, files);
let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed += 1;
    process.stderr.write(`${path.relative(root, file)}\n${result.stderr || result.stdout || ''}`);
  }
}

if (failed > 0) {
  process.stderr.write(`Sintaxis inválida en ${failed} archivo(s).\n`);
  process.exit(1);
}

process.stdout.write(`Sintaxis válida en ${files.length} archivos JavaScript.\n`);
