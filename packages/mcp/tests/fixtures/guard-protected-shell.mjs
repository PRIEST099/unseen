#!/usr/bin/env node

/**
 * guard-protected-shell.mjs
 *
 * PreToolUse hook for the shell tools (execute_bash, execute_pwsh).
 * Blocks a shell command whose text names a protected path AND contains a
 * writing operation. Reading (cat, type, Get-Content, git diff) stays allowed.
 *
 * Protected: expected-hauntings.json, docs/brief, .env*
 *
 * Exit codes (same as guard-protected-files.mjs):
 *   0 = allow
 *   2 = block
 * Errors: fail closed when the raw input mentions a protected path, otherwise fail open.
 *
 * Limit: this is a text check. A command that builds the path at run time
 * (string concatenation, variables read from elsewhere) is not caught.
 */

import { pathToFileURL } from 'node:url';

const PROTECTED = [
  /expected-hauntings\.json/i,
  /docs[\\/]+brief/i,
  /(?:^|[\s"'`/\\=:(,])\.env(?:\.[\w.-]+|\*)?(?![\w-])/i,
];

const CMD_START = '(?<![\\w./\\\\-])';
const CMD_END = '(?![\\w-])';
const WRITE_COMMANDS = [
  'cp', 'mv', 'rm', 'del', 'erase', 'rd', 'rmdir', 'ren', 'rename', 'copy', 'move',
  'xcopy', 'robocopy', 'tee', 'truncate', 'install',
  'Copy-Item', 'Move-Item', 'Remove-Item', 'Rename-Item', 'New-Item',
  'Set-Content', 'Add-Content', 'Clear-Content', 'Out-File',
].map((c) => c.replace(/-/g, '\\-'));

const WRITE_PATTERNS = [
  new RegExp(`${CMD_START}(?:${WRITE_COMMANDS.join('|')})${CMD_END}`, 'i'),
  /\bsed\b[^|;&\n]*\s(?:-[a-zA-Z]*i|--in-place)/i,
  /writeFile|appendFile|rmSync|unlink|copyFile|renameSync|createWriteStream|truncateSync/,
  /\bgit\s+(?:checkout|restore|reset|clean|rm|mv|apply|switch)\b/i,
];

/** Remove `>` forms that are not file writes: `=>`, `->`, `2>&1`, `> $null`, `> /dev/null`. */
function stripHarmlessArrows(text) {
  return text
    .replace(/=>|->/g, ' ')
    .replace(/\d*>&\d+/g, ' ')
    .replace(/\d*>>?\s*(?:\$null|\/dev\/null|NUL)\b/gi, ' ');
}

export function namesProtectedPath(text) {
  return PROTECTED.some((pattern) => pattern.test(text));
}

export function hasWritingOperation(text) {
  if (stripHarmlessArrows(text).includes('>')) return true;
  return WRITE_PATTERNS.some((pattern) => pattern.test(text));
}

/** @returns {{ block: boolean, reason: string }} */
export function decide(command) {
  if (!namesProtectedPath(command)) return { block: false, reason: '' };
  if (!hasWritingOperation(command)) return { block: false, reason: '' };
  return {
    block: true,
    reason: 'the command names a protected path together with a writing operation',
  };
}

function commandText(data) {
  const args = data?.tool_input ?? data?.toolInput ?? {};
  if (typeof args.command === 'string') return args.command;
  return JSON.stringify(args);
}

async function readStdin() {
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

async function main() {
  const input = await readStdin();
  try {
    const data = JSON.parse(input);
    const verdict = decide(commandText(data));
    if (verdict.block) {
      process.stderr.write(
        'BLOCKED: protected files are owned by the product lead and cannot be written from the shell.\n' +
          `Reason: ${verdict.reason}.\n` +
          'Protected: apps/cursed-shop/expected-hauntings.json, docs/brief/**, .env*\n' +
          'Reading them (cat, type, Get-Content, git diff) is allowed. If a change is needed, ask the product lead.\n',
      );
      process.exit(2);
    }
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (namesProtectedPath(input)) {
      process.stderr.write(`Hook error while checking a command that names a protected path: ${message}\n`);
      process.exit(2);
    }
    process.stderr.write(`Hook script error: ${message}\n`);
    process.exit(0);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
