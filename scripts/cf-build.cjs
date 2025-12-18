#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CLI = 'npx @cloudflare/next-on-pages@1.11.3';
const workerPath = path.join('.vercel', 'output', 'static', '_worker.js');
const stubSrc = path.join('lib', 'async_hooks_stub.js');
const stubDest = path.join('.vercel', 'output', 'static', 'async_hooks_stub.js');

function main() {
  // 1) 先运行官方构建
  execSync(CLI, { stdio: 'inherit' });

  // 2) 如果产物存在，复制 stub 并替换引用
  if (!fs.existsSync(workerPath)) {
    console.error(`Missing worker file: ${workerPath}`);
    process.exit(1);
  }

  fs.copyFileSync(stubSrc, stubDest);
  const original = fs.readFileSync(workerPath, 'utf8');
  const patched = original.replace(/require\(["']async_hooks["']\)/g, 'require("./async_hooks_stub.js")');
  fs.writeFileSync(workerPath, patched, 'utf8');
  console.log('Patched async_hooks to stub in _worker.js');
}

main();
