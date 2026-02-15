#!/usr/bin/env node
/**
 * Dev launcher: starts Next.js (port 3000) and legacy backend (port 3001) together.
 * Use: npm run dev:all (from repo root)
 * Avoids concurrently spawn issues on Windows.
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const platformDir = path.join(rootDir, 'crm-platform');

const isWin = process.platform === 'win32';

function run(name, cmd, args, cwd, env = {}) {
  const opt = {
    cwd: cwd || rootDir,
    stdio: 'inherit',
    shell: isWin,
    env: { ...process.env, ...env }
  };
  const p = spawn(cmd, args, opt);
  p.on('error', (err) => {
    console.error(`[${name}] failed to start:`, err.message);
  });
  p.on('exit', (code, sig) => {
    if (code != null && code !== 0) {
      console.error(`[${name}] exited with code ${code}`);
    }
    if (sig) {
      console.error(`[${name}] killed by signal ${sig}`);
    }
  });
  return p;
}

console.log('[dev-all] Starting Next.js (3000) and legacy backend (3001)...\n');

// Next.js: npm run dev -- --port 3000 from crm-platform
const next = run('Next.js', 'npm', ['run', 'dev:turbo', '--', '--port', '3000'], platformDir);

// Legacy backend: nodemon server.js from root (port 3001)
const backend = run('Backend', 'npx', ['nodemon', 'server.js'], rootDir, { PORT: '3001' });

// Exit when either exits (optional: kill the other)
function onexit() {
  next.kill();
  backend.kill();
  process.exit(0);
}
process.on('SIGINT', onexit);
process.on('SIGTERM', onexit);
