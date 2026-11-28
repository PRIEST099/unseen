import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** `@keyframes` names are global to the document: the last declaration wins for every user of the name. */
function keyframeNames(css: string): string[] {
  return [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((match) => match[1] ?? '')
}

const stylesDir = __dirname
const sheets = readdirSync(stylesDir).filter((entry) => entry.endsWith('.css'))

describe('ghosts.css keyframes', () => {
  it('declares no keyframes name that another stylesheet declares (so it never replaces Spirit Sight\'s ghost-bob)', () => {
    const own = keyframeNames(readFileSync(join(stylesDir, 'ghosts.css'), 'utf8'))
    expect(own).toContain('margin-ghost-bob')
    const others = sheets
      .filter((entry) => entry !== 'ghosts.css')
      .flatMap((entry) => keyframeNames(readFileSync(join(stylesDir, entry), 'utf8')))
    expect(others).toContain('ghost-bob')
    expect(own.filter((name) => others.includes(name))).toEqual([])
  })
})
