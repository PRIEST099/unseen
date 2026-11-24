#!/usr/bin/env node

/**
 * stop-test-gate.mjs
 * 
 * Stop hook that runs TypeScript check and unit tests in packages/core.
 * Prints pass/fail summary so the agent sees red tests before claiming success.
 */

import { execSync } from 'child_process';

let typecheckPassed = false;
let testsPassed = false;

console.log('Running final verification...\n');

// TypeScript check
try {
  execSync('npm run typecheck -w @the-unseen/core', {
    stdio: 'pipe',
    encoding: 'utf8',
    cwd: process.cwd(),
  });
  console.log('✓ TypeScript check passed');
  typecheckPassed = true;
} catch (error) {
  console.error('✗ TypeScript check FAILED');
  if (error.stdout) console.error(error.stdout);
  if (error.stderr) console.error(error.stderr);
}

// Unit tests (not Playwright; too slow)
try {
  execSync('npx vitest --run', {
    stdio: 'pipe',
    encoding: 'utf8',
    cwd: 'packages/core',
    timeout: 180000, // 180s
  });
  console.log('✓ Unit tests passed');
  testsPassed = true;
} catch (error) {
  console.error('✗ Unit tests FAILED');
  if (error.stdout) console.error(error.stdout);
  if (error.stderr) console.error(error.stderr);
}

console.log('\n--- Final Status ---');
console.log(`TypeCheck: ${typecheckPassed ? 'PASS' : 'FAIL'}`);
console.log(`Tests: ${testsPassed ? 'PASS' : 'FAIL'}`);

if (!typecheckPassed || !testsPassed) {
  console.error('\n⚠️  Some checks failed. Review before claiming completion.');
}

process.exit(0); // Always exit 0; this is informational, not blocking
