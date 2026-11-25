import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { arbHaunting, makeHaunting } from '../test-support/haunting-arbitraries'
import { HAUNTING_DISPLAY_NAMES, HAUNTING_TYPE_ORDER, mostSevere } from './haunting-display'
import { groupHauntings } from './haunting-groups'

describe('haunting display names', () => {
  it('covers exactly the ten types, each as spaced words of its identifier', () => {
    expect([...HAUNTING_TYPE_ORDER].sort()).toEqual(Object.keys(HAUNTING_DISPLAY_NAMES).sort())
    expect(HAUNTING_TYPE_ORDER).toHaveLength(10)
    for (const type of HAUNTING_TYPE_ORDER) {
      expect(HAUNTING_DISPLAY_NAMES[type]).toBe(type.replace(/([a-z])([A-Z])/g, '$1 $2'))
    }
  })
})

describe('mostSevere', () => {
  it('ranks Wraith over Restless over Banished', () => {
    expect(mostSevere(['Banished', 'Restless'])).toBe('Restless')
    expect(mostSevere(['Banished', 'Wraith', 'Restless'])).toBe('Wraith')
    expect(mostSevere(['Banished'])).toBe('Banished')
  })
})

describe('groupHauntings', () => {
  it('always returns the ten groups in sidebar order, empty ones included', () => {
    const groups = groupHauntings([])
    expect(groups.map((group) => group.type)).toEqual([...HAUNTING_TYPE_ORDER])
    expect(groups.every((group) => group.count === 0 && group.severity === null)).toBe(true)
  })

  it('counts every haunting exactly once and reports the most severe level', () => {
    fc.assert(
      fc.property(fc.array(arbHaunting, { maxLength: 40 }), (hauntings) => {
        const groups = groupHauntings(hauntings)
        expect(groups.reduce((sum, group) => sum + group.count, 0)).toBe(hauntings.length)
        for (const group of groups) {
          expect(group.instances.every((haunting) => haunting.type === group.type)).toBe(true)
          expect(group.count).toBe(group.instances.length)
          if (group.severity !== null) {
            expect(group.severity).toBe(mostSevere(group.instances.map((haunting) => haunting.severity)))
          }
        }
      }),
    )
  })

  it('shows a Wraith group as Wraith', () => {
    const groups = groupHauntings([makeHaunting({ severity: 'Banished' }), makeHaunting({ severity: 'Wraith' })])
    expect(groups.find((group) => group.type === 'NamelessSpirit')?.severity).toBe('Wraith')
  })
})
