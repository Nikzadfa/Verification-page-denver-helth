#!/usr/bin/env node
/**
 * One-command local setup.
 *
 * Creates a .env if there isn't one (generating a real AUTH_SECRET rather than
 * shipping a placeholder), waits for the database, applies migrations, and
 * seeds the manufacturer / fault-code / procedure / eval data.
 *
 * Safe to re-run: the seed upserts, and an existing .env is never overwritten.
 */

import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');

const step = (m) => console.log(`\n\x1b[36m▸\x1b[0m ${m}`);
const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const warn = (m) => console.log(`  \x1b[33m!\x1b[0m ${m}`);

const run = (cmd, opts = {}) => execSync(cmd, { cwd: root, stdio: 'inherit', ...opts });

// --- .env -------------------------------------------------------------------
step('Environment');
if (existsSync(envPath)) {
  ok('.env already exists, leaving it alone');
} else {
  const example = readFileSync(resolve(root, '.env.example'), 'utf8');
  writeFileSync(
    envPath,
    example.replace('AUTH_SECRET=""', `AUTH_SECRET="${randomBytes(48).toString('base64')}"`),
  );
  ok('.env created with a freshly generated AUTH_SECRET');
  warn('ANTHROPIC_API_KEY is blank — that is fine. The diagnostic engine is');
  warn('deterministic and works without it; only free-text understanding,');
  warn('narration and photo analysis use a model.');
}

// --- database ---------------------------------------------------------------
step('Waiting for PostgreSQL');
if (!/^DATABASE_URL="[^"]+"/m.test(readFileSync(envPath, 'utf8'))) {
  console.error('  Could not read DATABASE_URL from .env');
  process.exit(1);
}

let ready = false;
for (let i = 0; i < 30; i += 1) {
  try {
    execSync('npx prisma db execute --stdin', {
      cwd: root,
      input: 'SELECT 1;',
      stdio: ['pipe', 'ignore', 'ignore'],
    });
    ready = true;
    break;
  } catch {
    process.stdout.write('.');
    try {
      execSync('sleep 1');
    } catch {
      /* Windows shells have no `sleep`; the retry loop still paces itself. */
    }
  }
}
console.log('');

if (!ready) {
  console.error('  Could not reach the database at the DATABASE_URL in .env.\n');
  console.error('  Start one with Docker:   docker compose up -d');
  console.error('  Or point DATABASE_URL at your own PostgreSQL 15+ with the');
  console.error('  `vector` extension available.');
  process.exit(1);
}
ok('database reachable');

// --- schema and data --------------------------------------------------------
step('Applying migrations');
run('npx prisma migrate deploy');

step('Generating Prisma client');
run('npx prisma generate');

step('Seeding manufacturers, fault codes, procedures and eval cases');
run('npx tsx prisma/seed.ts');

console.log(`
\x1b[32mSetup complete.\x1b[0m

  npm run dev          then open http://localhost:3000

Create your own account at /register, or load a ready-made one:

  npm run db:demo      demo@thermorivet.local / demo1234567  (admin, Pro plan,
                       with a worked example diagnosis already in the history)
`);
