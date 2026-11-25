import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const POWER = fileURLToPath(new URL('../../../power', import.meta.url))
const CLAIM = /\b(is|are|now|fully)\s+(accessible|compliant)\b|passes WCAG|WCAG compliant/i
const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/

function readJson(name: string): Record<string, unknown> {
  const data: unknown = JSON.parse(readFileSync(join(POWER, name), 'utf8'))
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error(`${name} is not an object`)
  return Object.fromEntries(Object.entries(data))
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

/** Structural copy of the published schemas: required fields and additionalProperties false. */
function checkKeys(value: Record<string, unknown>, required: string[], allowed: string[]): void {
  for (const key of required) expect(Object.keys(value), `missing ${key}`).toContain(key)
  for (const key of Object.keys(value)) expect(allowed, `unexpected ${key}`).toContain(key)
}

describe('plugin.json', () => {
  const plugin = readJson('plugin.json')
  test('matches the plugin schema', () => {
    checkKeys(plugin, ['name', 'version', 'description'], ['$schema', 'name', 'version', 'description', 'author', 'keywords'])
    expect(plugin['$schema']).toBe('https://agent-plugins.org/schemas/1.0.0/plugin.schema.json')
    expect(String(plugin['name'])).toMatch(KEBAB)
    expect(plugin['name']).toBe('the-unseen')
    const author = plugin['author']
    expect(typeof author === 'object' && author !== null && typeof Object.fromEntries(Object.entries(author))['name'] === 'string').toBe(true)
  })
  test('has the required keywords', () => {
    const keywords = plugin['keywords']
    expect(Array.isArray(keywords)).toBe(true)
    for (const k of ['accessibility', 'a11y', 'WCAG', 'screen reader', 'button', 'form', 'UI', 'component', 'HTML', 'React']) {
      expect(keywords).toContain(k)
    }
  })
})

describe('mcp.json', () => {
  const mcp = readJson('mcp.json')
  test('matches the mcp schema: $schema, one stdio server named unseen running unseen-mcp', () => {
    checkKeys(mcp, ['mcpServers'], ['$schema', 'mcpServers'])
    expect(mcp['$schema']).toBe('https://agent-plugins.org/schemas/1.0.0/mcp.schema.json')
    const servers = mcp['mcpServers']
    if (typeof servers !== 'object' || servers === null) throw new Error('mcpServers missing')
    expect(Object.keys(servers)).toEqual(['unseen'])
    const unseen = Object.fromEntries(Object.entries(Object.fromEntries(Object.entries(servers))['unseen'] ?? {}))
    checkKeys(unseen, ['type', 'command'], ['type', 'command', 'args', 'env'])
    expect(unseen['type']).toBe('stdio')
    expect(unseen['command']).toBe('unseen-mcp')
  })
  test('has no disabled, autoApprove or unseen-local', () => {
    const text = readFileSync(join(POWER, 'mcp.json'), 'utf8')
    for (const word of ['disabled', 'autoApprove', 'unseen-local']) expect(text).not.toContain(word)
  })
})

describe('skills', () => {
  const skills = readdirSync(join(POWER, 'skills'))
  test('ships the expected skills', () => {
    for (const s of ['audit-before-done', 'exorcise', 'install-unseen-hooks']) expect(skills).toContain(s)
  })
  test.each(skills)('%s has name and description front matter, kebab-case, matching its folder', (skill) => {
    const text = readFileSync(join(POWER, 'skills', skill, 'SKILL.md'), 'utf8')
    const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? ''
    const name = /^name:\s*(.+)$/m.exec(front)?.[1]?.trim() ?? ''
    const description = /^description:\s*(.+)$/m.exec(front)?.[1]?.trim() ?? ''
    expect(name).toBe(skill)
    expect(name).toMatch(KEBAB)
    expect(description.length).toBeGreaterThan(20)
  })
  test('audit-before-done quotes the steering rule exactly', () => {
    const text = readFileSync(join(POWER, 'skills', 'audit-before-done', 'SKILL.md'), 'utf8')
    expect(text).toContain('Audit every UI you build or change before saying the task is done.')
  })
})

describe('power folder', () => {
  test('has no package.json, POWER.md or hooks folder', () => {
    expect(existsSync(join(POWER, 'package.json'))).toBe(false)
    expect(existsSync(join(POWER, 'POWER.md'))).toBe(false)
    expect(existsSync(join(POWER, 'hooks'))).toBe(false)
  })
  test('no text file makes a compliance claim', () => {
    for (const file of walk(POWER).filter((f) => /\.(md|json|html)$/.test(f))) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(CLAIM)
    }
  })
})
