import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const STAGED = fileURLToPath(new URL('./fixtures/unseen-auditor.json', import.meta.url))
const REAL = fileURLToPath(new URL('../../../.kiro/agents/unseen-auditor.json', import.meta.url))
const FOUR_TOOLS = ['unseen/audit_url', 'unseen/audit_html', 'unseen/explain_haunting', 'unseen/suggest_fix']

type Rule = { capability: string; effect: string; match?: string[] }

function parse(path: string): Record<string, unknown> {
  const data: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error('agent file is not an object')
  return Object.fromEntries(Object.entries(data))
}

function rules(agent: Record<string, unknown>): Rule[] {
  const permissions = agent['permissions']
  if (typeof permissions !== 'object' || permissions === null || !('rules' in permissions) || !Array.isArray(permissions.rules)) throw new Error('no rules')
  return permissions.rules.map((r: unknown) => {
    if (typeof r !== 'object' || r === null || !('capability' in r) || !('effect' in r)) throw new Error('bad rule')
    const match = 'match' in r && Array.isArray(r.match) ? r.match.map(String) : undefined
    return { capability: String(r.capability), effect: String(r.effect), ...(match ? { match } : {}) }
  })
}

describe('unseen-auditor agent (staged copy, and the real file when it exists)', () => {
  const targets = [STAGED, ...(existsSync(REAL) ? [REAL] : [])]

  test.each(targets)('schema keys in %s', (path) => {
    const agent = parse(path)
    expect(agent['name']).toBe('unseen-auditor')
    expect(agent['tools']).toEqual(['read', '@unseen'])
    expect(agent['includePowers']).toBe(false)
    expect(agent).not.toHaveProperty('allowedTools')
    expect(agent).not.toHaveProperty('includeMcpJson')
    expect(agent).toHaveProperty('mcpServers.unseen')
    expect(typeof agent['prompt']).toBe('string')
  })

  test.each(targets)('permission rules in %s: read allowed, the four tools allowed, writes and shell denied', (path) => {
    const list = rules(parse(path))
    expect(list).toContainEqual({ capability: 'fs_read', effect: 'allow' })
    const mcp = list.find((r) => r.capability === 'mcp')
    expect(mcp?.effect).toBe('allow')
    expect([...(mcp?.match ?? [])].sort()).toEqual([...FOUR_TOOLS].sort())
    expect(list).toContainEqual({ capability: 'fs_write', match: ['**'], effect: 'deny' })
    expect(list).toContainEqual({ capability: 'shell', match: ['**'], effect: 'deny' })
    expect(list.filter((r) => r.effect === 'allow' && (r.capability === 'fs_write' || r.capability === 'shell'))).toHaveLength(0)
  })

  test.each(targets)('prompt in %s names the caveat and makes no compliance claim', (path) => {
    const prompt = String(parse(path)['prompt'])
    expect(prompt).toMatch(/30 to 40 percent/)
    expect(prompt).toMatch(/never edit files/i)
    expect(prompt).not.toMatch(/\b(is|are|now|fully)\s+(accessible|compliant)\b|passes WCAG|WCAG compliant/i)
  })

  test('the real file, when present, equals the staged copy', () => {
    if (!existsSync(REAL)) return
    expect(parse(REAL)).toEqual(parse(STAGED))
  })
})
