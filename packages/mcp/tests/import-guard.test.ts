import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const SRC = fileURLToPath(new URL('../src', import.meta.url))

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith('.ts') ? [path] : []
  })
}

function specifiers(text: string): string[] {
  return [...text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1] ?? '')
}

test('mcp source imports Core only through @the-unseen/core or @the-unseen/core/speech', () => {
  for (const file of sourceFiles(SRC)) {
    for (const spec of specifiers(readFileSync(file, 'utf8'))) {
      if (spec.includes('the-unseen/core')) expect(['@the-unseen/core', '@the-unseen/core/speech'], `${file}: ${spec}`).toContain(spec)
      expect(spec, `${file}: ${spec}`).not.toMatch(/packages\/core|\.\.\/\.\.\/core/)
    }
  }
})

test('pure modules import no Node built-ins and no I/O modules', () => {
  for (const file of sourceFiles(join(SRC, 'pure'))) {
    for (const spec of specifiers(readFileSync(file, 'utf8'))) {
      expect(spec, `${file}: ${spec}`).not.toMatch(/^node:|^fs$|^path$|workspace|dirty|hooks-cli/)
    }
  }
})

test('pure modules read no clock and no randomness', () => {
  for (const file of sourceFiles(join(SRC, 'pure'))) {
    expect(readFileSync(file, 'utf8'), file).not.toMatch(/Date\.now\(|new Date\(|Math\.random\(/)
  }
})
