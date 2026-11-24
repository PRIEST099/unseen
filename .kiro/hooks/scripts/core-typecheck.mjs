#!/usr/bin/env node

/**
 * core-typecheck.mjs
 * 
 * PostFileSave hook for packages/core/src/**\/*.ts
 * Runs TypeScript type check and prints a one-line summary.
 */

import { execSync } from 'child_process';

try {
  execSync('npm run typecheck -w @the-unseen/core', {
    stdio: 'pipe',
    encoding: 'utf8',
    cwd: process.cwd(),
  });
  console.log('✓ packages/core type check passed');
  process.exit(0);
} catch (error) {
  console.error('✗ packages/core type check failed');
  if (error.stdout) console.error(error.stdout);
  if (error.stderr) console.error(error.stderr);
  process.exit(0); // Don't block; just inform
}
