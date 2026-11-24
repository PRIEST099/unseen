import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const CLASSIFIER_DIR = dirname(fileURLToPath(import.meta.url))
const SRC_DIR = resolve(CLASSIFIER_DIR, '..')
const RUNNER_DIR = join(SRC_DIR, 'runner')

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return tsFiles(full)
    return full.endsWith('.ts') ? [full] : []
  })
}

/** Every module specifier in static imports, re-exports, dynamic imports and require calls. */
export function importSpecifiers(source: string): string[] {
  const specs: string[] = []
  const patterns = [
    /\b(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g, // import x from 'y', export { x } from 'y'
    /\bimport\s*['"]([^'"]+)['"]/g, // import 'y'
    /\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g, // import('y'), require('y')
  ]
  for (const pattern of patterns) for (const m of source.matchAll(pattern)) if (m[1]) specs.push(m[1])
  return specs
}

const intoRunner = (file: string, spec: string): boolean => {
  if (!spec.startsWith('.')) return false
  const target = resolve(dirname(file), spec)
  return target === RUNNER_DIR || target.startsWith(RUNNER_DIR + sep)
}

describe('classifier / runner boundary', () => {
  const files = tsFiles(CLASSIFIER_DIR).filter((f) => f !== fileURLToPath(import.meta.url))

  it('finds the classifier sources', () => {
    expect(files.length).toBeGreaterThan(20)
    expect(files.some((f) => f.endsWith(`${sep}classify.ts`))).toBe(true)
  })

  it('no classifier file imports anything that resolves into src/runner/', () => {
    const offenders: string[] = []
    for (const file of files) {
      for (const spec of importSpecifiers(readFileSync(file, 'utf8'))) {
        if (intoRunner(file, spec)) offenders.push(`${relative(SRC_DIR, file)} imports ${spec}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('no classifier file reaches for I/O, time or randomness', () => {
    const banned = /\b(?:Date\.now|Math\.random|new Date|performance\.now|process\.env|console\.\w+)\b|from\s+['"]node:|require\(/
    const offenders = files
      .filter((f) => !f.endsWith('.test.ts'))
      .filter((f) => banned.test(readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')))
      .map((f) => relative(SRC_DIR, f))
    expect(offenders).toEqual([])
  })

  it('the scanner itself sees a runner import (it would fail if one existed)', () => {
    const fake = join(CLASSIFIER_DIR, 'detectors', 'x.ts')
    for (const spec of ['../../runner/browser.js', '../../runner/axe', '../../runner']) {
      expect(importSpecifiers(`import { a } from '${spec}'`)).toEqual([spec])
      expect(intoRunner(fake, spec)).toBe(true)
    }
    expect(importSpecifiers(`export { a } from '../../runner/ax-tree.js'`)).toEqual(['../../runner/ax-tree.js'])
    expect(importSpecifiers(`const m = await import('../../runner/cdp.js')`)).toEqual(['../../runner/cdp.js'])
    expect(intoRunner(fake, '../util.js')).toBe(false)
    expect(intoRunner(fake, '../../types.js')).toBe(false)
    expect(intoRunner(fake, 'playwright')).toBe(false)
  })
})
