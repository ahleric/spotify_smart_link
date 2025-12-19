#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const VERCEL_BUILD = 'npx vercel@50.1.2 build';
const NEXT_ON_PAGES = 'npx @cloudflare/next-on-pages@1.11.3 --skip-build';
const VERCEL_PROJECT_JSON = path.join('.vercel', 'project.json');
const FUNCTIONS_DIR = path.join('.vercel', 'output', 'functions');

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(fullPath));
    else files.push(fullPath);
  }
  return files;
}

function ensureVercelProjectSettings() {
  if (fs.existsSync(VERCEL_PROJECT_JSON)) return;

  fs.mkdirSync(path.dirname(VERCEL_PROJECT_JSON), { recursive: true });
  fs.writeFileSync(
    VERCEL_PROJECT_JSON,
    JSON.stringify(
      {
        projectId: 'prj_0000000000000000000000000000',
        orgId: 'team_000000000000000000000000',
        projectName: 'landing-page-tool',
        settings: {
          createdAt: 0,
          framework: 'nextjs',
          devCommand: null,
          installCommand: null,
          buildCommand: null,
          outputDirectory: null,
          rootDirectory: null,
          directoryListing: false,
          nodeVersion: '22.x',
        },
      },
      null,
      2,
    ),
  );
}

function patchAsyncHooksInVercelOutput() {
  if (!fs.existsSync(FUNCTIONS_DIR)) {
    console.error(`Missing Vercel functions dir: ${FUNCTIONS_DIR}`);
    process.exit(1);
  }

  let changedFiles = 0;
  for (const file of walk(FUNCTIONS_DIR)) {
    if (!/\.(cjs|mjs|js)$/.test(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    let patched = source.replace(
      /require\((['"])async_hooks\1\)/g,
      'require("node:async_hooks")',
    );
    patched = patched.replace(
      /import\((['"])async_hooks\1\)/g,
      'import("node:async_hooks")',
    );
    patched = patched.replace(/from\s+(['"])async_hooks\1/g, 'from "node:async_hooks"');
    if (patched !== source) {
      fs.writeFileSync(file, patched, 'utf8');
      changedFiles += 1;
    }
  }
  console.log(`Patched async_hooks -> node:async_hooks in ${changedFiles} files`);
}

function main() {
  // 1) 生成 Vercel Build Output（.vercel/output）
  ensureVercelProjectSettings();
  execSync(VERCEL_BUILD, { stdio: 'inherit' });

  // 2) 修补 Vercel 输出：将 async_hooks 改为 node:async_hooks，便于 next-on-pages 打包
  patchAsyncHooksInVercelOutput();

  // 3) 基于修补后的 Vercel 输出生成 Cloudflare Pages 产物（.vercel/output/static）
  execSync(NEXT_ON_PAGES, { stdio: 'inherit' });
}

main();
