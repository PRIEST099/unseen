#!/usr/bin/env node

/**
 * shop-verify.mjs
 * 
 * PostFileSave hook for apps/cursed-shop/**\/*.(html|css|js|svg)
 * Runs the shop verification script and prints a one-line summary.
 */

import { execSync } from 'child_process';

try {
  execSync('npm run verify -w cursed-shop', {
    stdio: 'pipe',
    encoding: 'utf8',
    cwd: process.cwd(),
  });
  console.log('✓ cursed-shop verification passed');
  process.exit(0);
} catch (error) {
  console.error('✗ cursed-shop verification failed');
  if (error.stdout) console.error(error.stdout);
  if (error.stderr) console.error(error.stderr);
  process.exit(0); // Don't block; just inform
}
