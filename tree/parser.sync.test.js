'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const contract = require('./syntax-contract.json');

const projectRoot = path.resolve(__dirname, '..');
const source = path.join(__dirname, 'cpp-parser-probe.cpp');
const executable = path.join(os.tmpdir(), `covering-parser-probe-${process.pid}${process.platform === 'win32' ? '.exe' : ''}`);
const finder = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', ['g++'], { encoding: 'utf8' });

if (finder.status !== 0) {
  throw new Error('找不到 g++，无法执行 covering.hpp 同步测试');
}

const compiler = finder.stdout.split(/\r?\n/).find(Boolean).trim();
const environment = { ...process.env };
environment.PATH = `${path.dirname(compiler)}${path.delimiter}${environment.PATH || ''}`;

const build = spawnSync(compiler, ['-std=c++20', '-O0', '-o', executable, source], {
  cwd: projectRoot,
  encoding: 'utf8',
  env: environment
});

if (build.status !== 0) {
  throw new Error(`covering.hpp 探针编译失败：\n${build.stderr || build.stdout}`);
}

try {
  contract.valid.filter(({ cpp }) => cpp !== 'skip').forEach(({ source: expression, cppSource, normalized, cpp }) => {
    const result = spawnSync(executable, [cppSource || expression], { encoding: 'utf8', env: environment });
    assert.equal(result.status, 0, `${expression}\n${result.stderr}`);
    if (cpp === 'same') assert.equal(result.stdout.trim(), normalized, expression);
  });

  contract.invalid.filter(({ cpp }) => cpp === 'reject').forEach(({ source: expression }) => {
    const result = spawnSync(executable, [expression], { encoding: 'utf8', env: environment });
    assert.notEqual(result.status, 0, expression);
  });
} finally {
  fs.rmSync(executable, { force: true });
}

console.log('browser parser and covering.hpp syntax contract are synchronized');
