#!/usr/bin/env node

/**
 * guard-protected-files.mjs
 * 
 * PreToolUse hook that blocks writes to protected paths.
 * Protected: apps/cursed-shop/expected-hauntings.json, docs/brief/**, .env*, paths outside workspace.
 * 
 * Exit codes:
 *   0 = allow (non-protected path)
 *   2 = block (protected path)
 *   other = fail open (allow on script error for non-protected paths)
 */

import { readFileSync } from 'fs';
import { resolve, normalize, relative } from 'path';

// Read hook input from stdin
let input = '';
process.stdin.setEncoding('utf8');

for await (const chunk of process.stdin) {
  input += chunk;
}

try {
  const data = JSON.parse(input);
  
  // Hook stdin uses snake_case: tool_name and tool_input
  // Accept toolInput as fallback for compatibility
  const args = data.tool_input || data.toolInput || {};
  
  // Extract file path from tool arguments - try common field names
  const targetFile = args.path || args.targetFile || args.file_path || args.oldStr || null;
  
  if (!targetFile) {
    // No file path argument; not a file write operation
    process.exit(0);
  }
  
  // Resolve path against the cwd from hook context
  const workspaceRoot = data.cwd || process.env.KIRO_WORKSPACE_ROOT || process.cwd();
  const absPath = resolve(workspaceRoot, targetFile);
  const relPath = relative(workspaceRoot, absPath);
  const normalizedRel = normalize(relPath).replace(/\\/g, '/');
  
  // Check if path is outside workspace
  if (normalizedRel.startsWith('..') || absPath.startsWith('..')) {
    process.stderr.write(`BLOCKED: Cannot write outside workspace.\nPath: ${targetFile}\n`);
    process.exit(2);
  }
  
  // Protected patterns
  const protectedPatterns = [
    /^apps\/cursed-shop\/expected-hauntings\.json$/,
    /^docs\/brief\/.*/,
    /^\.env.*/,
  ];
  
  for (const pattern of protectedPatterns) {
    if (pattern.test(normalizedRel)) {
      process.stderr.write(
        `🚫 BLOCKED: This file is protected and owned by the product lead.\n` +
        `Path: ${normalizedRel}\n` +
        `If you need to change it, ask the product lead.\n`
      );
      process.exit(2);
    }
  }
  
  // Allow: not protected
  process.exit(0);
  
} catch (error) {
  // Fail closed if the error happens while processing a protected path mention
  // Check if any argument mentions a protected path
  const argsStr = JSON.stringify(process.argv);
  const stdinStr = input || '';
  const combined = argsStr + stdinStr;
  
  if (combined.includes('expected-hauntings.json') || 
      combined.includes('docs/brief') || 
      /\.env/i.test(combined)) {
    process.stderr.write(`Hook error while checking protected path: ${error.message}\n`);
    process.exit(2);
  }
  
  // Otherwise fail open
  process.stderr.write(`Hook script error: ${error.message}\n`);
  process.exit(0);
}
